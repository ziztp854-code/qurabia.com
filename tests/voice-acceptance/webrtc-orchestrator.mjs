/** Real local SFU + two independent native WebRTC processes; generated audio only. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { matchesTone } from './webrtc-audio-metric.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'apps/web/package.json'));
const {
  AccessToken,
  RoomServiceClient,
  TokenVerifier,
  TrackSource,
} = require('livekit-server-sdk');
const here = path.dirname(fileURLToPath(import.meta.url));

export function loadRuntime(runtimeFile) {
  const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
  const endpoint = new URL(runtime.url);
  assert.equal(endpoint.hostname, '127.0.0.1', 'Only the isolated loopback SFU is allowed');
  assert.equal(endpoint.port, '17880');
  return runtime;
}

export async function createNativeClient(name, logDir, { exposeGc = false } = {}) {
  fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
  const output = fs.openSync(path.join(logDir, `${name}.log`), 'w', 0o600);
  const env = { ...process.env, NODE_ENV: 'production' };
  // This process refuses every non-loopback URL. Rust's WebSocket proxy handling
  // may ignore NO_PROXY; remove proxy selectors for this local transport only.
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
  ])
    delete env[key];
  const child = fork(path.join(here, 'webrtc-client.mjs'), [], {
    env,
    execArgv: exposeGc ? ['--expose-gc'] : undefined,
    stdio: ['ignore', output, output, 'ipc'],
  });
  fs.closeSync(output);
  const pending = new Map();
  let sequence = 0;
  let readyResolve;
  let readyReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => {
      const error = new Error(`Native ${name} exited: ${code ?? signal}`);
      readyReject(error);
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      pending.clear();
      resolve({ code, signal });
    }),
  );
  child.on('error', readyReject);
  child.on('message', (message) => {
    if (message.ready) {
      readyResolve(message);
      return;
    }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.ok) item.resolve(message.result);
    else item.reject(new Error(`Native ${name}: ${message.error}`));
  });
  const startTimer = setTimeout(
    () => readyReject(new Error(`Native ${name} readiness timeout`)),
    15000,
  );
  let baseline;
  try {
    baseline = await ready;
  } finally {
    clearTimeout(startTimer);
  }
  return {
    pid: child.pid,
    baseline,
    child,
    request(action, value = {}, timeoutMs = 22000) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Native ${name} command deadline: ${action}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        child.send({ id, action, value });
      });
    },
    async close() {
      if (child.exitCode !== null) return exited;
      await this.request('shutdown');
      let timeout;
      try {
        return await Promise.race([
          exited,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error(`Native ${name} did not exit naturally after dispose`)),
              8000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timeout);
      }
    },
    async abort() {
      if (child.exitCode === null) child.kill('SIGTERM');
      return exited;
    },
  };
}

/** Transparent loopback signaling relay. It intentionally does not replace app admission. */
export async function startSignalRelay(runtime, port = 17890) {
  const upstream = new URL(runtime.url.replace(/^ws/, 'http'));
  const connections = new Map();
  const sockets = new Set();
  const verify = new TokenVerifier(runtime.key, runtime.secret);
  const server = http.createServer((req, res) => {
    const proxy = http.request(
      new URL(req.url, upstream),
      { method: req.method, headers: { ...req.headers, host: upstream.host } },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.pipe(res);
      },
    );
    proxy.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(proxy);
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('upgrade', async (req, downstream, head) => {
    downstream.on('error', () => {});
    try {
      const url = new URL(req.url, upstream);
      const token =
        url.searchParams.get('access_token') ||
        /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      const claims = await verify.verify(token);
      const proxy = http.request(url, { headers: { ...req.headers, host: upstream.host } });
      proxy.on('upgrade', (response, connection, upstreamHead) => {
        const pair = { downstream, upstream: connection };
        const identity = claims.sub;
        if (!connections.has(identity)) connections.set(identity, new Set());
        connections.get(identity).add(pair);
        downstream.write(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            Object.entries(response.headers)
              .map(([key, value]) => `${key}: ${value}`)
              .join('\r\n') +
            '\r\n\r\n',
        );
        if (upstreamHead.length) downstream.write(upstreamHead);
        if (head.length) connection.write(head);
        downstream.pipe(connection);
        connection.pipe(downstream);
        const cleanup = () => {
          connections.get(identity)?.delete(pair);
          downstream.destroy();
          connection.destroy();
        };
        downstream.on('close', cleanup);
        connection.on('close', cleanup);
        connection.on('error', cleanup);
      });
      proxy.on('error', () => downstream.destroy());
      proxy.end();
    } catch {
      downstream.destroy();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `ws://127.0.0.1:${port}`,
    drop(identity) {
      const pairs = [...(connections.get(identity) || [])];
      for (const pair of pairs) {
        pair.downstream.destroy();
        pair.upstream.destroy();
      }
      return { droppedWebSockets: pairs.length, droppedAt: Date.now() };
    },
    count: () => [...connections.values()].reduce((sum, set) => sum + set.size, 0),
    async close() {
      for (const set of connections.values())
        for (const pair of set) {
          pair.downstream.destroy();
          pair.upstream.destroy();
        }
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function joinToken(runtime, room, identity) {
  const token = new AccessToken(runtime.key, runtime.secret, { identity, ttl: 60 });
  token.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
  });
  return token.toJwt();
}
export async function waitUntil(check, description, timeoutMs = 12000) {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Bounded native test did not observe ${description}`);
}
function goodTone(stats, expected) {
  return matchesTone(stats.audio, expected);
}

export async function runTwoClientVerification(runtimeFile, outputFile) {
  const runtime = loadRuntime(runtimeFile);
  const roomName = `voice-approval-${randomUUID()}`;
  const logDir = path.join(path.dirname(runtimeFile), 'native-client-logs');
  const admin = new RoomServiceClient(
    runtime.url.replace(/^ws/, 'http'),
    runtime.key,
    runtime.secret,
  );
  const clients = [];
  const result = {
    scope:
      'Two independent native Node processes, real local SFU/WebRTC media transport, generated440/660Hz PCM; no physical microphones or devices, no application/NextAuth/database admission.',
    physicalDevicesTested: false,
    appAdmissionTested: false,
    server: {
      image: runtime.image,
      imageId: runtime.imageId,
      version: runtime.version,
      binarySha256: runtime.binarySha256,
    },
    roomName,
    startedAt: new Date().toISOString(),
    checks: {},
    observations: {},
    cleanup: {},
  };
  let relay;
  const writeResult = () => {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
  };
  try {
    relay = await startSignalRelay(runtime);
    const a = await createNativeClient('a', logDir);
    clients.push(a);
    const b = await createNativeClient('b', logDir);
    clients.push(b);
    assert.notEqual(a.pid, b.pid);
    result.observations.processes = [a.baseline, b.baseline];
    const connect = async (client, identity, toneHz) =>
      client.request('connect', {
        url: relay.url,
        token: await joinToken(runtime, roomName, identity),
        toneHz,
      });
    result.observations.joins = await Promise.all([
      connect(a, 'approval-a', 440),
      connect(b, 'approval-b', 660),
    ]);
    const audioA = await waitUntil(async () => {
      const stats = await a.request('stats');
      return goodTone(stats, 660) && stats;
    }, '660Hz PCM decoded by A');
    const audioB = await waitUntil(async () => {
      const stats = await b.request('stats');
      return goodTone(stats, 440) && stats;
    }, '440Hz PCM decoded by B');
    result.observations.bidirectional = { a: audioA, b: audioB };
    result.observations.rtcStats = await Promise.all([
      a.request('rtcStats'),
      b.request('rtcStats'),
    ]);
    result.checks.independentProcesses = true;
    result.checks.bidirectionalDecodedPcm = true;
    assert.equal((await admin.listParticipants(roomName)).length, 2);

    const pause = await a.request('pauseCapture');
    await delay(750);
    const pausedB = await b.request('stats', { since: pause.issuedAt + 250 });
    assert(
      pausedB.audio.rms < 100,
      'Generated source pause should become remote silence after250ms drain grace',
    );
    result.observations.generatedCapturePause = { pause, drainGraceMs: 250, measurement: pausedB };
    result.checks.generatedCapturePauseStopsRemoteEnergy = true;
    await a.request('resumeCapture');
    await waitUntil(
      async () => goodTone(await b.request('stats'), 440),
      '440Hz after source resume',
    );
    result.checks.generatedCaptureResume = true;

    const before = await a.request('stats');
    const reconnectCount = before.events.filter((event) => event.event === 'reconnected').length;
    const drop = relay.drop('approval-a');
    assert(drop.droppedWebSockets >= 1, 'Must drop an actual established signaling socket');
    const recoveredA = await waitUntil(
      async () => {
        const stats = await a.request('stats');
        return (
          stats.events.filter((event) => event.event === 'reconnected').length > reconnectCount &&
          goodTone(stats, 660) &&
          stats
        );
      },
      'native recovery after an actual signaling WebSocket cut',
      20000,
    );
    await waitUntil(
      async () => goodTone(await b.request('stats'), 440),
      'remote PCM after signaling recovery',
    );
    assert.equal((await admin.listParticipants(roomName)).length, 2);
    assert.equal(recoveredA.diagnostic.localPublications, 1);
    result.observations.signalingRecovery = {
      drop,
      recoveredAt: Date.now(),
      recoveryMs: Date.now() - drop.droppedAt,
      recoveredA,
    };
    result.checks.actualSignalingWebSocketRecovery = true;

    result.observations.churnCycles = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
      const leaveA = await a.request('leave');
      await waitUntil(
        async () => (await admin.listParticipants(roomName)).length === 1,
        'one server participant after A leaves',
      );
      await delay(600);
      const remoteAfterLeave = await b.request('stats', {
        since: leaveA.sourceStop.stoppedAt + 250,
      });
      assert.equal(leaveA.diagnostic.roomListeners, 0);
      assert.equal(leaveA.diagnostic.ffiListeners, 0);
      assert.equal(leaveA.diagnostic.streams, 0);
      assert.equal(leaveA.diagnostic.consumerJobs, 0);
      assert.equal(leaveA.diagnostic.sourceClosed, true);
      assert.equal(leaveA.diagnostic.sourceTimerActive, false);
      assert.equal(leaveA.diagnostic.producing, false);
      assert(
        leaveA.sourceStop.localCaptureStopMs < 150,
        'Generated capture stop should not wait for any45s HTTP deadline',
      );
      assert(
        remoteAfterLeave.audio.rms < 100,
        'No energetic decoded PCM from departedA after250ms drain grace',
      );
      const leaveObservation = { cycle, local: leaveA, remoteAfterLeave, drainGraceMs: 250 };
      if (cycle === 1) result.observations.leaveA = leaveObservation;
      result.checks.localGeneratedCaptureStoppedBeforeDisconnect = true;
      result.checks.remoteAudioQuietAfterLeaveDrain = true;
      result.checks.observedNativeResourcesReleasedAfterLeave = true;

      const rejoinA = await connect(a, 'approval-a', 440);
      await waitUntil(
        async () => goodTone(await a.request('stats'), 660),
        'A PCM on a new explicit session',
      );
      await waitUntil(async () => goodTone(await b.request('stats'), 440), 'B PCM after A rejoins');
      assert.equal((await admin.listParticipants(roomName)).length, 2);
      result.observations.churnCycles.push({ ...leaveObservation, rejoin: rejoinA });
    }
    result.checks.explicitLeaveRejoin = true;
    result.checks.threeChurnCyclesReleaseObservedMediaCounters = true;
    result.observations.finalLeaves = await Promise.all([a.request('leave'), b.request('leave')]);
    await waitUntil(
      async () => (await admin.listParticipants(roomName)).length === 0,
      'zero server participants after both leave',
    );
    result.cleanup.serverParticipants = 0;
    result.cleanup.clients = [];
    for (const client of clients) {
      const status = await client.close();
      assert.equal(status.code, 0, 'Native process must exit naturally after dispose');
      assert.equal(status.signal, null);
      result.cleanup.clients.push({ pid: client.pid, ...status });
    }
    await waitUntil(() => relay.count() === 0, 'zero relay signaling connections');
    result.cleanup.relayConnections = 0;
    result.checks.naturalChildProcessExit = true;
    result.passed = Object.values(result.checks).every(Boolean);
  } catch (error) {
    result.passed = false;
    result.error = String(error.message)
      .replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[token-redacted]')
      .slice(0, 1000);
    throw error;
  } finally {
    for (const client of clients) {
      if (client.child.exitCode !== null) continue;
      try {
        await client.close();
      } catch {
        result.cleanup.forcedChildExit = true;
        await client.abort();
      }
    }
    await relay?.close();
    try {
      await admin.deleteRoom(roomName);
      result.cleanup.roomDeleted = true;
    } catch (error) {
      result.cleanup.roomDeletionError = String(error.message).slice(0, 250);
    }
    result.finishedAt = new Date().toISOString();
    writeResult();
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtimeFile = path.resolve(process.argv[2] || '/tmp/tahaddi-approval-webrtc/runtime.json');
  const outputFile = path.resolve(
    process.argv[3] ||
      path.join(root, 'docs/visual-evidence/live-room-responsive/approval-webrtc-result.json'),
  );
  runTwoClientVerification(runtimeFile, outputFile)
    .then((result) => {
      console.log(
        JSON.stringify({ passed: result.passed, checks: result.checks, outputFile }, null, 2),
      );
    })
    .catch((error) => {
      console.error(String(error.message).replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[token-redacted]'));
      process.exitCode = 1;
    });
}
