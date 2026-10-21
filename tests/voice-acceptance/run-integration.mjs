import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
  lstat,
  unlink,
  rmdir,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

// Opt-in provisioning of brand-new disposable databases. Never reads app credentials.
const root = fileURLToPath(new URL('../../', import.meta.url));
const web = path.join(root, 'apps/web');
const execute = promisify(execFile);
const dockerEnv = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete dockerEnv[key];
const docker = (args) =>
  execute('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    env: dockerEnv,
    maxBuffer: 8 * 1024 * 1024,
  });
const ownershipLabel = 'dev.tahaddi.voice-approval-run';

async function removePrivateRuntime(stateFile, state) {
  const directory = path.dirname(stateFile);
  if (
    path.dirname(directory) !== path.resolve(tmpdir()) ||
    !/^voice-approval-integration-[A-Za-z0-9]+$/.test(path.basename(directory)) ||
    path.basename(stateFile) !== 'state.json' ||
    state.envFile !== path.join(directory, 'session.env')
  )
    throw new Error('Refusing to remove an unexpected runtime path');
  const stat = await lstat(directory);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    (stat.mode & 0o077) !== 0
  )
    throw new Error('Runtime directory is not private and owned by this user');
  const entries = await readdir(directory);
  if (entries.some((entry) => !['session.env', 'state.json'].includes(entry)))
    throw new Error('Unexpected runtime contents; refusing deletion');
  for (const entry of entries) {
    const target = path.join(directory, entry);
    const file = await lstat(target);
    if (
      !file.isFile() ||
      file.isSymbolicLink() ||
      file.uid !== process.getuid() ||
      (file.mode & 0o077) !== 0
    )
      throw new Error('Unexpected runtime file; refusing deletion');
  }
  if (entries.includes('session.env')) await unlink(state.envFile);
  await unlink(stateFile);
  await rmdir(directory);
}

async function ownedContainer(state) {
  if (
    !/^voice-approval-integration-[a-f0-9]{12}$/.test(state.container) ||
    !/^[a-f0-9]{24}$/.test(state.nonce)
  )
    throw new Error('Invalid task ownership record');
  const { stdout } = await docker([
    'inspect',
    '--format',
    '{{json .Config.Labels}}',
    state.container,
  ]);
  if (JSON.parse(stdout)[ownershipLabel] !== state.nonce)
    throw new Error('Refusing to touch a container not created by this run');
  const id = (await docker(['inspect', '--format', '{{.Id}}', state.container])).stdout.trim();
  if (id !== state.id) throw new Error('Container identity changed; refusing cleanup');
}

if (process.argv[2] === '--cleanup') {
  const stateFile = path.resolve(process.argv[3] || '');
  const stat = await lstat(stateFile);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o077) !== 0 ||
    stat.uid !== process.getuid()
  )
    throw new Error('Cleanup needs the private run-owned state file');
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  await ownedContainer(state);
  await docker(['rm', '--force', state.container]);
  await removePrivateRuntime(stateFile, state);
  await writeFile(
    path.join(root, 'docs/visual-evidence/live-room-responsive/approval-integration-cleanup.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        container: state.container,
        containerIdentityVerified: true,
        containerRemoved: true,
        privateEnvironmentAndStateRemoved: true,
        runtimeDirectoryRemoved: true,
        applicationDatabaseTouched: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Removed the verified run-owned container and its private environment/state directory.',
  );
  process.exit(0);
}

if (process.env.VOICE_APPROVAL_RUN_INTEGRATION !== '1')
  throw new Error('Set VOICE_APPROVAL_RUN_INTEGRATION=1 to create isolated test databases');
const keep = process.argv.includes('--keep-container');
const run = randomUUID().replaceAll('-', '').slice(0, 12);
const nonce = randomBytes(12).toString('hex');
const container = `voice-approval-integration-${run}`;
const port = 55442;
const password = randomBytes(24).toString('hex');
const databases = {
  voice: `voice_test_approval_${run}`,
  community: 'community_voice_test',
  profile: `profile_test_approval_${run}`,
  load: `voice_test_load_approval_${run}`,
};
const allowedDatabases = new Set(Object.values(databases));
const connection = (database) => {
  if (!allowedDatabases.has(database)) throw new Error('Unknown isolated database');
  const url = new URL(`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`);
  if (
    url.hostname !== '127.0.0.1' ||
    url.port !== String(port) ||
    url.search ||
    url.hash ||
    !allowedDatabases.has(url.pathname.slice(1))
  )
    throw new Error('Unsafe database target');
  return url.toString();
};
const runtime = await mkdtemp(path.join(tmpdir(), 'voice-approval-integration-'));
const stateFile = path.join(runtime, 'state.json');
const envFile = path.join(runtime, 'session.env');
const evidence = path.join(root, 'docs/visual-evidence/live-room-responsive');
const logs = '/workspace/scratch';
await mkdir(logs, { recursive: true });
await mkdir(evidence, { recursive: true });
let created = false;
let provisioned = false;
let state;
const summary = {
  run,
  startedAt: new Date().toISOString(),
  isolation: {
    host: '127.0.0.1',
    port,
    container,
    databases,
    storage: 'new tmpfs only; no host data mounts',
    applicationDatabaseUsed: false,
  },
  results: [],
  retainedForLoad: false,
};
const redact = (value) => String(value).replaceAll(password, '[REDACTED]');

try {
  await docker(['info', '--format', '{{.ServerVersion}}']);
  const image = (
    await docker(['image', 'inspect', '--format', '{{.Id}}', 'postgres:17-alpine'])
  ).stdout.trim();
  summary.isolation.image = image;
  // Docker refuses the bind if the dedicated loopback port is already occupied.
  const result = await docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    container,
    '--label',
    `${ownershipLabel}=${nonce}`,
    '--publish',
    `127.0.0.1:${port}:5432`,
    '--tmpfs',
    '/var/lib/postgresql/data:rw,nosuid,size=512m',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    'postgres:17-alpine',
  ]);
  created = true;
  state = {
    container,
    id: result.stdout.trim(),
    nonce,
    port,
    databases,
    envFile,
    createdAt: summary.startedAt,
  };
  await writeFile(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
  for (let attempt = 0; ; attempt++) {
    try {
      // The image starts a socket-only temporary server during initialization.
      // Wait for the final TCP server, not that short-lived setup process.
      await docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  await ownedContainer(state);
  for (const database of allowedDatabases) {
    if (
      !/^(?:voice_test_(?:load_)?approval_[a-f0-9]{12}|profile_test_approval_[a-f0-9]{12}|community_voice_test)$/.test(
        database,
      )
    )
      throw new Error('Database name guard failed');
    await docker([
      'exec',
      container,
      'psql',
      '--username',
      'postgres',
      '--dbname',
      'postgres',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      `CREATE DATABASE "${database}"`,
    ]);
  }
  const require = createRequire(path.join(root, 'package.json'));
  const { Client } = require('pg');
  const migrationRoot = path.join(root, 'prisma/migrations');
  const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const database of [databases.voice, databases.profile, databases.load]) {
    const client = new Client({ connectionString: connection(database) });
    await client.connect();
    try {
      const target = await client.query('SELECT current_database() AS name');
      if (target.rows[0].name !== database) throw new Error('Database identity mismatch');
      for (const migration of migrations)
        await client.query(
          await readFile(path.join(migrationRoot, migration, 'migration.sql'), 'utf8'),
        );
    } finally {
      await client.end();
    }
  }
  provisioned = true;
  // Community suite itself replays migration history in its separately guarded DB.
  await writeFile(
    envFile,
    `DATABASE_URL=${connection(databases.load)}\nDIRECT_URL=${connection(databases.load)}\nVOICE_TEST_DATABASE_URL=${connection(databases.voice)}\nCOMMUNITY_VOICE_TEST_DATABASE_URL=${connection(databases.community)}\nPROFILE_TEST_DATABASE_URL=${connection(databases.profile)}\n`,
    { mode: 0o600 },
  );
  console.log(`Private test environment file: ${envFile}`);
  console.log(`Ownership state file: ${stateFile}`);
  const suites = [
    {
      name: 'voice',
      file: 'src/lib/voice/repository-quota.integration.test.ts',
      config: 'vitest.voice-quota.config.ts',
      key: 'VOICE_TEST_DATABASE_URL',
      database: databases.voice,
    },
    {
      name: 'community',
      file: 'src/lib/community/community.integration.test.ts',
      config: 'vitest.config.ts',
      key: 'COMMUNITY_VOICE_TEST_DATABASE_URL',
      database: databases.community,
    },
    {
      name: 'profile',
      file: 'src/lib/profile/repository.database.integration.test.ts',
      config: 'vitest.config.ts',
      key: 'PROFILE_TEST_DATABASE_URL',
      database: databases.profile,
    },
  ];
  for (const suite of suites) {
    await ownedContainer(state);
    const jsonFile = path.join(logs, `approval-integration-${suite.name}-${run}.json`);
    const logFile = path.join(logs, `approval-integration-${suite.name}-${run}.log`);
    const started = Date.now();
    let exitCode = 0;
    let output;
    try {
      output = await execute(
        process.execPath,
        [
          'node_modules/vitest/vitest.mjs',
          'run',
          suite.file,
          '--config',
          suite.config,
          '--maxWorkers=1',
          '--reporter=json',
          `--outputFile=${jsonFile}`,
        ],
        {
          cwd: web,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            DATABASE_URL: connection(suite.database),
            DIRECT_URL: connection(suite.database),
            [suite.key]: connection(suite.database),
          },
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    } catch (error) {
      exitCode = Number(error.code) || 1;
      output = error;
    }
    await writeFile(logFile, redact(`${output.stdout || ''}\n${output.stderr || ''}`));
    const report = JSON.parse(await readFile(jsonFile, 'utf8'));
    const record = {
      suite: suite.name,
      file: suite.file,
      exitCode,
      elapsedMs: Date.now() - started,
      passed: report.numPassedTests,
      failed: report.numFailedTests,
      skipped: report.numPendingTests,
      total: report.numTotalTests,
      tests: report.testResults.flatMap((result) =>
        result.assertionResults.map((test) => ({
          name: test.fullName,
          status: test.status,
          failureMessages: test.failureMessages.map(redact),
        })),
      ),
      logFile,
    };
    summary.results.push(record);
    console.log(
      `${suite.name}: passed=${record.passed} failed=${record.failed} skipped=${record.skipped} exit=${exitCode}`,
    );
  }
} catch (error) {
  summary.setupError = redact(error.stack || error);
  console.error(redact(error.message || error));
} finally {
  summary.finishedAt = new Date().toISOString();
  if (created && keep && provisioned) {
    summary.retainedForLoad = true;
    summary.privateRuntime = { envFile, stateFile };
  } else if (created) {
    await ownedContainer(state);
    await docker(['rm', '--force', container]);
    await removePrivateRuntime(stateFile, state);
    summary.cleanedUp = true;
  }
  await writeFile(
    path.join(evidence, 'approval-integration-results.json'),
    JSON.stringify(summary, null, 2),
  );
}
if (
  summary.setupError ||
  summary.results.some((result) => result.failed || result.skipped || result.exitCode)
)
  process.exitCode = 1;
