/** Fresh opt-in execution of the 81 remaining adjacent database/Redis tests.
 * Creates only new, labeled, loopback-only disposable containers; never uses app URLs.
 * The two Blender asset-pipeline tests are deliberately outside voice acceptance.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

assert.equal(
  process.env.VOICE_CLOSURE_RUN_ADJACENT,
  '1',
  'Explicit disposable-test opt-in required',
);
const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = path.join(root, 'docs/visual-evidence/live-room-responsive');
const web = path.join(root, 'apps/web');
const realtime = path.join(root, 'apps/realtime');
const require = createRequire(path.join(root, 'package.json'));
const { Client } = require('pg');
const exec = promisify(execFile);
const run = randomUUID().replaceAll('-', '').slice(0, 12);
const nonce = randomBytes(16).toString('hex');
const password = randomBytes(24).toString('hex');
const label = 'dev.tahaddi.voice-closure-adjacent';
const inventory = JSON.parse(
  await readFile(path.join(evidence, 'closure-skips-inventory.json'), 'utf8'),
);
const testFiles = [...new Set(inventory.tests.map((test) => test.file))];
const sourceHashes = async () =>
  Object.fromEntries(
    await Promise.all(
      testFiles.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(path.join(root, file)))
          .digest('hex'),
      ]),
    ),
  );
const beforeHashes = await sourceHashes();
const pgPort = 55443;
const redisPort = 56380;
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
  exec('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    env: dockerEnv,
    maxBuffer: 4 * 1024 * 1024,
  });
const owned = [];
const summary = {
  startedAt: new Date().toISOString(),
  scope:
    '81 adjacent production contracts; zero direct LiveKit/PCM/heartbeat tests among the remaining 83. No source assertions or skip guards changed.',
  run,
  freshExecution: true,
  cacheUsed: false,
  isolation: {
    loopbackOnly: true,
    newContainersOnly: true,
    existingApplicationDatabaseTouched: false,
    hostDataMounts: false,
    pgPort,
    redisPort,
  },
  sourceGroups: [],
  testSourceSha256Before: beforeHashes,
  cleanup: [],
};
const redact = (s) => String(s).replaceAll(password, '[REDACTED]');
function connection(database) {
  assert(database === `kingdoms_test_closure_${run}` || database === 'openclaw_approval_test');
  return `postgresql://postgres:${password}@127.0.0.1:${pgPort}/${database}`;
}
async function verify(resource) {
  const inspect = JSON.parse(
    (await docker(['inspect', '--format', '{{json .}}', resource.name])).stdout,
  );
  assert.equal(inspect.Id, resource.id);
  assert.equal(inspect.Config.Labels[label], nonce);
}
async function runTests(name, cwd, args, env) {
  const rawFile = path.join(evidence, `closure-skips-${name}-raw.json`);
  const started = Date.now();
  let exitCode = 0,
    output = '';
  try {
    const r = await exec(process.execPath, args.concat(['--outputFile', rawFile]), {
      cwd,
      env,
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    output = r.stdout + r.stderr;
  } catch (error) {
    exitCode = typeof error.code === 'number' ? error.code : 1;
    output = (error.stdout || '') + (error.stderr || '') + '\n' + error.message;
  }
  await writeFile(path.join(evidence, `closure-skips-${name}.log`), redact(output));
  const raw = JSON.parse(redact(await readFile(rawFile, 'utf8')));
  await writeFile(rawFile, JSON.stringify(raw, null, 2) + '\n');
  const tests = raw.testResults.flatMap((file) =>
    file.assertionResults.map((test) => ({
      file: path.relative(root, file.name),
      name: test.fullName,
      status: test.status,
      failureMessages: test.failureMessages,
      durationMs: test.duration,
    })),
  );
  const result = {
    name,
    exitCode,
    durationMs: Date.now() - started,
    passed: raw.numPassedTests,
    failed: raw.numFailedTests,
    skipped: raw.numPendingTests,
    command: [process.execPath, ...args, '--outputFile', path.relative(root, rawFile)],
    tests,
  };
  summary.sourceGroups.push(result);
  console.log(
    JSON.stringify({
      group: name,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      exitCode,
    }),
  );
}
try {
  await docker(['info', '--format', '{{.ServerVersion}}']);
  const pgImage = (
    await docker(['image', 'inspect', '--format', '{{.Id}}', 'postgres:17-alpine'])
  ).stdout.trim();
  const redisImage = (
    await docker(['image', 'inspect', '--format', '{{.Id}}', 'redis:7.4-alpine'])
  ).stdout.trim();
  summary.isolation.images = { postgres: pgImage, redis: redisImage };
  const pg = { name: `voice-closure-pg-${run}` };
  pg.id = (
    await docker([
      'run',
      '--detach',
      '--rm',
      '--pull=never',
      '--name',
      pg.name,
      '--label',
      `${label}=${nonce}`,
      '--publish',
      `127.0.0.1:${pgPort}:5432`,
      '--tmpfs',
      '/var/lib/postgresql/data:rw,nosuid,size=768m',
      '--env',
      `POSTGRES_PASSWORD=${password}`,
      pgImage,
    ])
  ).stdout.trim();
  owned.push(pg);
  await verify(pg);
  for (let attempt = 0; ; attempt++) {
    try {
      await docker(['exec', pg.name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']);
      break;
    } catch (error) {
      if (attempt >= 40) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  const kingdomDb = `kingdoms_test_closure_${run}`;
  for (const db of [kingdomDb, 'openclaw_approval_test']) {
    assert(/^(kingdoms_test_closure_[a-f0-9]{12}|openclaw_approval_test)$/.test(db));
    await docker([
      'exec',
      pg.name,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE DATABASE "${db}"`,
    ]);
  }
  const client = new Client({ connectionString: connection(kingdomDb) });
  await client.connect();
  try {
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, kingdomDb);
    const directory = path.join(root, 'prisma/migrations');
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((f) => f.isDirectory())
      .map((f) => f.name)
      .sort();
    for (const migration of migrations)
      await client.query(await readFile(path.join(directory, migration, 'migration.sql'), 'utf8'));
    summary.isolation.migrationDirectories = migrations.length;
  } finally {
    await client.end();
  }
  const pgFiles = [
    'src/lib/kingdoms/reports-repository.integration.test.ts',
    'src/lib/kingdoms/abandoned-repository.integration.test.ts',
    'src/lib/kingdoms/palace-garden.integration.test.ts',
    'src/lib/kingdoms/repository.integration.test.ts',
    'src/lib/kingdoms/commander-migration.integration.test.ts',
    'src/lib/kingdoms/village-onboarding.integration.test.ts',
    'src/lib/mamluk-map/village-relocation-repository.integration.test.ts',
    'src/lib/mamluk-map/repository.integration.test.ts',
    'src/lib/openclaw-admin/database.integration.test.ts',
  ];
  await runTests(
    'postgres',
    web,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...pgFiles,
      '--maxWorkers=1',
      '--no-file-parallelism',
      '--reporter=json',
    ],
    {
      ...process.env,
      DATABASE_URL: connection(kingdomDb),
      DIRECT_URL: connection(kingdomDb),
      KINGDOMS_TEST_DATABASE_URL: connection(kingdomDb),
      OPENCLAW_TEST_DATABASE_URL: connection('openclaw_approval_test'),
    },
  );
  // PostgreSQL and Redis phases are serialized, with one test worker in each.
  const redis = { name: `voice-closure-redis-${run}` };
  redis.id = (
    await docker([
      'run',
      '--detach',
      '--rm',
      '--pull=never',
      '--name',
      redis.name,
      '--label',
      `${label}=${nonce}`,
      '--publish',
      `127.0.0.1:${redisPort}:6379`,
      '--tmpfs',
      '/data:rw,nosuid,size=128m',
      redisImage,
      'redis-server',
      '--save',
      '',
      '--appendonly',
      'no',
    ])
  ).stdout.trim();
  owned.push(redis);
  await verify(redis);
  for (let attempt = 0; ; attempt++) {
    try {
      assert.equal((await docker(['exec', redis.name, 'redis-cli', 'PING'])).stdout.trim(), 'PONG');
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await runTests(
    'redis',
    realtime,
    [
      'node_modules/jest/bin/jest.js',
      '--runInBand',
      '--no-cache',
      '--runTestsByPath',
      'src/fastest-button/fastest-button.integration.spec.ts',
      'src/fastest-button/fastest-button.websocket.spec.ts',
      '--json',
    ],
    {
      ...process.env,
      FASTEST_TEST_REDIS_URL: `redis://127.0.0.1:${redisPort}/0`,
    },
  );
} catch (error) {
  summary.setupError = redact(error.message);
  process.exitCode = 1;
} finally {
  for (const resource of owned.reverse()) {
    try {
      await verify(resource);
      await docker(['rm', '--force', resource.name]);
      summary.cleanup.push({ name: resource.name, identityVerified: true, removed: true });
    } catch (error) {
      summary.cleanup.push({ name: resource.name, removed: false, error: redact(error.message) });
      process.exitCode = 1;
    }
  }
  summary.finishedAt = new Date().toISOString();
  summary.testSourceSha256After = await sourceHashes();
  summary.sourceAssertionsAndGuardsUnchanged =
    JSON.stringify(summary.testSourceSha256After) === JSON.stringify(beforeHashes);
  if (!summary.sourceAssertionsAndGuardsUnchanged) process.exitCode = 1;
  summary.total = summary.sourceGroups.reduce(
    (s, g) => ({
      passed: s.passed + g.passed,
      failed: s.failed + g.failed,
      skipped: s.skipped + g.skipped,
    }),
    { passed: 0, failed: 0, skipped: 0 },
  );
  if (summary.total.failed || summary.sourceGroups.some((g) => g.exitCode !== 0))
    process.exitCode = 1;
  await writeFile(
    path.join(evidence, 'closure-skips-execution.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      total: summary.total,
      cleanup: summary.cleanup,
      setupError: summary.setupError,
    }),
  );
}
