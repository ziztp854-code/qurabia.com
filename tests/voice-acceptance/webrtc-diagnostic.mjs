/** Bounded ICE evidence probe; no application credentials or physical audio. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  createNativeClient,
  joinToken,
  loadRuntime,
  waitUntil,
  startSignalRelay,
} from './webrtc-orchestrator.mjs';
const runtimeFile = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const runtime = loadRuntime(runtimeFile);
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { RoomServiceClient } = require('livekit-server-sdk');
const room = `closure-ice-${randomUUID()}`;
const admin = new RoomServiceClient(
  runtime.url.replace(/^ws/, 'http'),
  runtime.key,
  runtime.secret,
);
const clients = [];
let relay;
const result = {
  startedAt: new Date().toISOString(),
  scope: 'Bounded two-native-client ICE diagnostics, generated PCM only',
  checks: {},
  samples: [],
  cleanup: {},
};
const logFile = path.join(path.dirname(runtimeFile), 'diagnostic-server.log');
const fd = fs.openSync(logFile, 'w', 0o600);
const server = spawn(
  runtime.binary,
  ['--config', path.join(path.dirname(runtimeFile), 'livekit.yaml')],
  { stdio: ['ignore', fd, fd] },
);
fs.closeSync(fd);
const serverExit = new Promise((resolve) =>
  server.once('exit', (code, signal) => resolve({ code, signal })),
);
try {
  await waitUntil(
    async () => {
      try {
        return (await fetch(runtime.url.replace(/^ws/, 'http'))).ok;
      } catch {
        return false;
      }
    },
    'local SFU readiness',
    5000,
  );
  relay = await startSignalRelay(runtime);
  const a = await createNativeClient('probe-a', path.join(path.dirname(runtimeFile), 'probe-logs'));
  clients.push(a);
  const b = await createNativeClient('probe-b', path.join(path.dirname(runtimeFile), 'probe-logs'));
  clients.push(b);
  result.joins = await Promise.all(
    [
      [a, 'a', 440],
      [b, 'b', 660],
    ].map(async ([client, id, toneHz]) =>
      client.request('connect', {
        url: relay.url,
        token: await joinToken(runtime, room, id),
        toneHz,
      }),
    ),
  );
  for (const waitMs of [800, 3200, 4000]) {
    await delay(waitMs);
    result.samples.push({
      at: new Date().toISOString(),
      clients: await Promise.all(clients.map((c) => c.request('rtcStats'))),
      pcm: await Promise.all(clients.map((c) => c.request('pcmWindow'))),
    });
  }
  result.checks.connectedAndPublished = result.joins.every(
    (x) => x.diagnostic.localPublications === 1,
  );
  result.checks.pcmReceived = result.samples
    .at(-1)
    .clients.every((x) => x.audio.frames >= 15 && x.audio.rms > 300);
  result.participants = (await admin.listParticipants(room)).length;
} catch (error) {
  result.error = String(error.message).replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[token-redacted]');
  process.exitCode = 1;
} finally {
  result.cleanup.clients = [];
  for (const client of clients) {
    try {
      result.cleanup.clients.push(await client.close());
    } catch {
      result.cleanup.clients.push({ forced: true, ...(await client.abort()) });
    }
  }
  await relay?.close();
  try {
    await admin.deleteRoom(room);
    result.cleanup.roomDeleted = true;
  } catch {
    result.cleanup.roomDeleted = false;
  }
  server.kill('SIGTERM');
  result.cleanup.server = await serverExit;
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({ checks: result.checks, error: result.error, cleanup: result.cleanup, output }),
  );
}
assert(!result.error, result.error);
