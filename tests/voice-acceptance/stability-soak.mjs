/** Bounded real native-media churn. Generated PCM; no device or app admission claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import {
  loadRuntime,
  createNativeClient,
  joinToken,
  waitUntil,
  startSignalRelay,
} from './webrtc-orchestrator.mjs';
import { snapshotDescriptors } from './sdk-fd-snapshot.mjs';
import { matchesTone } from './webrtc-audio-metric.mjs';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { RoomServiceClient } = require('livekit-server-sdk');
const cycles = 12;
const settleMs = 2000;
const finalSettleMs = 5000;

function processSnapshot(pid) {
  const descriptors = snapshotDescriptors(pid);
  const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
  const numeric = (name) => Number(new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(status)?.[1]);
  return {
    at: Date.now(),
    pid,
    fdCount: descriptors.stableCount,
    descriptors,
    rssKiB: numeric('VmRSS'),
    threads: numeric('Threads'),
  };
}

function hasTone(stats, hz) {
  return matchesTone(stats.audio, hz);
}

function assertReleased(diagnostic) {
  assert.equal(diagnostic.connected, false);
  for (const field of ['roomListeners', 'ffiListeners', 'streams', 'consumerJobs'])
    assert.equal(diagnostic[field], 0, `${field} must be released after leave`);
  assert.equal(diagnostic.sourceClosed, true);
  assert.equal(diagnostic.sourceTimerActive, false);
  assert.equal(diagnostic.producing, false);
  assert.deepEqual(diagnostic.failures, []);
}

function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = (fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return { samples: samples.length, p50: rank(0.5), p95: rank(0.95), max: sorted.at(-1) };
}

async function run(runtimeFile, outputFile) {
  assert.equal(process.env.VOICE_STABILITY_RUN, '1', 'Explicit opt-in required');
  const runtime = loadRuntime(runtimeFile);
  const roomName = `voice-stability-${randomUUID()}`;
  const admin = new RoomServiceClient(
    runtime.url.replace(/^ws/, 'http'),
    runtime.key,
    runtime.secret,
  );
  const clients = [];
  let relay;
  const result = {
    scope:
      '12 bounded native WebRTC leave/rejoin cycles with a persistent independent peer; generated PCM, no physical devices, app admission, production server or capacity claim.',
    physicalDevicesTested: false,
    appAdmissionTested: false,
    startedAt: new Date().toISOString(),
    roomName,
    workload: { cycles, actualSignalingDrops: [4, 8, 12], settleMs, finalSettleMs },
    phases: [],
    recovery: [],
    cleanup: {},
    checks: {},
    sourceSha256: Object.fromEntries(
      [
        'stability-soak.mjs',
        'webrtc-client.mjs',
        'webrtc-orchestrator.mjs',
        'webrtc-local-setup.mjs',
        'sdk-fd-snapshot.mjs',
        'webrtc-audio-metric.mjs',
      ].map((file) => [
        file,
        createHash('sha256')
          .update(fs.readFileSync(new URL(file, import.meta.url)))
          .digest('hex'),
      ]),
    ),
  };
  const tone = async (client, hz, description) =>
    waitUntil(async () => {
      const sample = await client.request('stats');
      return hasTone(sample, hz) && sample;
    }, description);
  try {
    relay = await startSignalRelay(runtime);
    const logs = path.join(path.dirname(runtimeFile), 'stability-client-logs');
    const a = await createNativeClient('stability-a', logs, { exposeGc: true });
    clients.push(a);
    const b = await createNativeClient('stability-b', logs, { exposeGc: true });
    clients.push(b);
    assert.notEqual(a.pid, b.pid);
    result.processes = [a.pid, b.pid];
    result.coldBaseline = [processSnapshot(a.pid), processSnapshot(b.pid)];
    const connect = async (client, identity, hz) =>
      client.request('connect', {
        url: relay.url,
        token: await joinToken(runtime, roomName, identity),
        toneHz: hz,
      });
    await Promise.all([connect(a, 'stability-a', 440), connect(b, 'stability-b', 660)]);
    await Promise.all([tone(a, 660, 'initial A PCM'), tone(b, 440, 'initial B PCM')]);
    assert.equal((await admin.listParticipants(roomName)).length, 2);

    for (let cycle = 1; cycle <= cycles; cycle++) {
      if (cycle % 4 === 0) {
        const before = await a.request('stats');
        const prior = before.events.filter((event) => event.event === 'reconnected').length;
        const cut = relay.drop('stability-a');
        assert(cut.droppedWebSockets >= 1);
        const recovered = await waitUntil(
          async () => {
            const sample = await a.request('stats');
            return (
              sample.events.filter((event) => event.event === 'reconnected').length > prior &&
              hasTone(sample, 660) &&
              sample
            );
          },
          'native SDK recovery following actual signaling cut',
          20000,
        );
        await tone(b, 440, 'B PCM after signaling recovery');
        result.recovery.push({ cycle, cut, recoveredAt: Date.now(), recovered });
      }
      const leaveStart = performance.now();
      const departure = await a.request('leave');
      const leaveMs = performance.now() - leaveStart;
      assertReleased(departure.diagnostic);
      assert(departure.sourceStop.localCaptureStopMs < 150);
      assert(departure.sourceStop.stoppedAt <= departure.disconnectedAt);
      await waitUntil(
        async () => (await admin.listParticipants(roomName)).length === 1,
        'membership returns to persistent peer',
      );
      await delay(settleMs);
      const remoteAfterLeave = await b.request('stats', {
        since: departure.sourceStop.stoppedAt + 250,
      });
      assert(remoteAfterLeave.audio.rms < 100, 'No departed-source PCM after drain grace');
      const settled = await a.request('stats');
      assertReleased(settled.diagnostic);
      const afterLeave = { a: processSnapshot(a.pid), b: processSnapshot(b.pid) };
      const joinStart = performance.now();
      const join = await connect(a, 'stability-a', 440);
      const publishMs = performance.now() - joinStart;
      await Promise.all([tone(a, 660, 'A PCM after join'), tone(b, 440, 'B PCM after rejoin')]);
      const mediaReadyMs = performance.now() - joinStart;
      assert.equal((await admin.listParticipants(roomName)).length, 2);
      result.phases.push({
        cycle,
        leaveMs,
        publishMs,
        mediaReadyMs,
        departure,
        settled,
        afterLeave,
        join,
        remoteAfterLeave,
      });
    }
    const finalLeaves = await Promise.all([a.request('leave'), b.request('leave')]);
    for (const sample of finalLeaves) assertReleased(sample.diagnostic);
    await waitUntil(
      async () => (await admin.listParticipants(roomName)).length === 0,
      'zero participants after both clients leave',
    );
    await delay(finalSettleMs);
    result.finalNaturalSettle = [];
    for (const client of clients) {
      const sample = await client.request('stats');
      assertReleased(sample.diagnostic);
      result.finalNaturalSettle.push({
        diagnostic: sample.diagnostic,
        process: processSnapshot(client.pid),
      });
    }
    // Diagnostics below deliberately happen after natural-settle measurements.
    // They do not count as successful natural cleanup and never run in production.
    result.referenceDropWithoutGc = [];
    result.forcedGcDiagnostic = [];
    for (const client of clients) {
      result.referenceDropWithoutGc.push({
        pid: client.pid,
        ...(await client.request('fdSnapshot', { dropLastRoom: true, settleMs: 2000 })),
      });
      result.forcedGcDiagnostic.push({
        pid: client.pid,
        ...(await client.request('fdSnapshot', { gc: true, settleMs: 2000 })),
      });
    }
    result.cleanup.clients = [];
    for (const client of clients) {
      const status = await client.close();
      assert.deepEqual(status, { code: 0, signal: null });
      result.cleanup.clients.push({ pid: client.pid, ...status });
    }
    await waitUntil(() => relay.count() === 0, 'zero relay sockets after client shutdown');
    result.cleanup.serverParticipants = 0;
    result.cleanup.relayConnections = 0;
    result.checks = {
      distinctNativeProcesses: true,
      twelveChurnCycles: result.phases.length === cycles,
      threeActualSignalingRecoveries: result.recovery.length === 3,
      observedMediaCountersReleasedEveryLeave: true,
      generatedCaptureStopsBeforeDisconnect: true,
      noRemoteEnergyAfterDrain: true,
      membershipReturnsToBaselineEveryCycle: true,
      naturalChildProcessExit: true,
    };
    result.timingsMs = {
      leave: distribution(result.phases.map((item) => item.leaveMs)),
      publish: distribution(result.phases.map((item) => item.publishMs)),
      mediaReady: distribution(result.phases.map((item) => item.mediaReadyMs)),
      captureStop: distribution(
        result.phases.map((item) => item.departure.sourceStop.localCaptureStopMs),
      ),
      recovery: distribution(result.recovery.map((item) => item.recoveredAt - item.cut.droppedAt)),
    };
    result.fdSeries = result.phases.map((item) => ({
      cycle: item.cycle,
      a: item.afterLeave.a.fdCount,
      b: item.afterLeave.b.fdCount,
      aRssKiB: item.afterLeave.a.rssKiB,
      bRssKiB: item.afterLeave.b.rssKiB,
    }));
    result.passed = Object.values(result.checks).every(Boolean);
  } catch (error) {
    result.passed = false;
    result.error = String(error.message).replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[token-redacted]');
    process.exitCode = 1;
  } finally {
    result.cleanup.finalClientExit = [];
    for (const client of clients) {
      if (client.child.exitCode !== null) continue;
      try {
        result.cleanup.finalClientExit.push({ pid: client.pid, ...(await client.close()) });
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
      result.cleanup.roomDeleted = false;
      result.cleanup.roomDeletionError = error.name;
    }
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify({ passed: result.passed, cycles: result.phases.length, outputFile }));
}

if (!process.argv[2] || !process.argv[3])
  throw new Error('Provide runtime JSON and output JSON paths');
await run(path.resolve(process.argv[2]), path.resolve(process.argv[3]));
