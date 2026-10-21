/** Test-only SFU preparation. Never uses application or production credentials. */
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const image =
  'livekit/livekit-server@sha256:89ca9ce0791e18d6e03bf6e2c49ceb27e1c754eae8bd50c989386c1a5963791a';
const runtime = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'tahaddi-approval-webrtc'));
if (!runtime.startsWith(`${os.tmpdir()}${path.sep}`))
  throw new Error('Use a temporary runtime directory');
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
const runtimeFile = path.join(runtime, 'runtime.json');
if (fs.existsSync(runtimeFile)) throw new Error('Refusing to overwrite an existing test session');
const selectors = [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
];
const childEnv = { ...process.env };
for (const name of selectors) delete childEnv[name];
function docker(args) {
  const result = spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`Local Docker command failed: ${args[0]} (${result.stderr.slice(-1000)})`);
  return result.stdout.trim();
}
docker(['info', '--format', '{{.ServerVersion}}']);
try {
  docker(['image', 'inspect', image, '--format', '{{.Id}}']);
} catch {
  docker(['pull', image]);
}
const imageId = docker(['image', 'inspect', image, '--format', '{{.Id}}']);
const imageDigests = JSON.parse(
  docker(['image', 'inspect', image, '--format', '{{json .RepoDigests}}']),
);
if (!imageDigests.some((entry) => entry.endsWith(image.slice(image.indexOf('@')))))
  throw new Error('Pinned official image digest was not verified by Docker');
const container = docker(['create', image]);
const binary = path.join(runtime, 'livekit-server');
try {
  docker(['cp', `${container}:/livekit-server`, binary]);
} finally {
  docker(['rm', container]);
}
fs.chmodSync(binary, 0o700);
const versionResult = spawnSync(binary, ['--version'], { encoding: 'utf8' });
if (versionResult.status !== 0) throw new Error('Extracted official SFU cannot run');
const version = (versionResult.stdout + versionResult.stderr).trim();
const key = `approval_${randomBytes(9).toString('hex')}`;
const secret = randomBytes(32).toString('hex');
const config = [
  'port: 17880',
  'bind_addresses: [127.0.0.1]',
  'rtc:',
  // LiveKit's top-level bind_addresses does not constrain RTC TCP's wildcard
  // listener. This local UDP verification deliberately disables TCP fallback.
  '  tcp_port: 0',
  '  udp_port: 17882',
  '  use_external_ip: false',
  '  node_ip: 127.0.0.1',
  '  enable_loopback_candidate: true',
  '  interfaces:',
  '    includes: [lo]',
  '  ips:',
  '    includes: [127.0.0.1/32]',
  'keys:',
  `  ${key}: ${secret}`,
  'logging:',
  '  level: warn',
  '',
].join('\n');
fs.writeFileSync(path.join(runtime, 'livekit.yaml'), config, { mode: 0o600 });
fs.writeFileSync(
  runtimeFile,
  JSON.stringify(
    {
      url: 'ws://127.0.0.1:17880',
      key,
      secret,
      binary,
      image,
      imageId,
      version,
      binarySha256: createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      runtime,
      runtimeFile,
      image,
      imageId,
      version,
      binarySha256: createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
      scope:
        'Official pinned image, Docker SHA256 content verification, loopback-only native SFU; generated temporary credentials are not printed.',
    },
    null,
    2,
  ),
);
