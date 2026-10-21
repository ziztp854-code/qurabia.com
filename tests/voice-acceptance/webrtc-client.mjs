/** Independent native WebRTC process with generated PCM, not a physical microphone. */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { analyzePcmTone } from './webrtc-audio-metric.mjs';
import { snapshotDescriptors } from './sdk-fd-snapshot.mjs';
import {
  Room,
  RoomEvent,
  AudioSource,
  AudioFrame,
  AudioStream,
  LocalAudioTrack,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  SimulateScenarioKind,
  dispose,
} from '@livekit/rtc-node';

let room;
let source;
let track;
let producer;
let producing = false;
let paused = false;
let phase = 0;
let toneHz = 440;
let generatedFrames = 0;
let sourceClosed = true;
let lastSourceStop;
let lastRoom;
const streams = new Map();
const jobs = new Set();
const audio = [];
const events = [];
const failures = [];
const baselineFds = descriptorCount();
function descriptorCount() {
  try {
    return fs.readdirSync('/proc/self/fd').length;
  } catch {
    return null;
  }
}
function safeError(error) {
  return String(error?.message || error)
    .replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[token-redacted]')
    .slice(0, 800);
}
function diagnostic() {
  const current = room || lastRoom;
  return {
    pid: process.pid,
    connected: Boolean(room?.isConnected),
    connectionState: room?.connectionState ?? null,
    remoteParticipants: room?.remoteParticipants.size ?? 0,
    localPublications: room?.localParticipant?.trackPublications.size ?? 0,
    remotePublications: room
      ? [...room.remoteParticipants.values()].reduce((sum, p) => sum + p.trackPublications.size, 0)
      : 0,
    roomListeners: current
      ? current.eventNames().reduce((sum, name) => sum + current.listenerCount(name), 0)
      : 0,
    ffiListeners: globalThis._ffiClientInstance?.listenerCount('ffi_event') ?? 0,
    streams: streams.size,
    consumerJobs: jobs.size,
    producing,
    paused,
    generatedFrames,
    sourceClosed,
    sourceQueueMs: source?.queuedDuration ?? 0,
    sourceTimerActive: Boolean(source?.timeout),
    activeHandleTypes: process._getActiveHandles().map((handle) => handle.constructor.name),
    fdCount: descriptorCount(),
    baselineFds,
    lastSourceStop,
    failures: [...failures],
  };
}
function sampleStats(since = Date.now() - 450) {
  const selected = audio.filter((entry) => entry.at >= since);
  const samples = selected.flatMap((entry) => Array.from(entry.samples));
  return {
    since,
    measuredAt: Date.now(),
    frames: selected.length,
    sampleCount: samples.length,
    ...analyzePcmTone(samples),
    frequencyEstimator: 'hann-fft',
    lastFrameAt: selected.at(-1)?.at ?? null,
    lastEnergeticFrameAt: [...audio].reverse().find((entry) => entry.rms > 100)?.at ?? null,
  };
}
function consume(remoteTrack, participant) {
  const stream = new AudioStream(remoteTrack, { sampleRate: 48000, numChannels: 1 });
  const reader = stream.getReader();
  const id = remoteTrack.sid || `${participant.identity}-${Date.now()}`;
  streams.set(id, reader);
  const job = (async () => {
    try {
      while (true) {
        const { value: frame, done } = await reader.read();
        if (done) break;
        const samples = Int16Array.from(frame.data);
        let squared = 0;
        for (const value of samples) squared += value * value;
        audio.push({ at: Date.now(), samples, rms: Math.sqrt(squared / samples.length) });
        if (audio.length > 220) audio.shift();
      }
    } catch (error) {
      if (room?.isConnected) failures.push(`consumer: ${safeError(error)}`);
    } finally {
      streams.delete(id);
      reader.releaseLock();
    }
  })();
  jobs.add(job);
  void job.finally(() => jobs.delete(job));
}
async function startProducer() {
  producing = true;
  producer = (async () => {
    while (producing) {
      if (paused) {
        await delay(10);
        continue;
      }
      const samples = new Int16Array(480);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.round(Math.sin(((phase + i) * 2 * Math.PI * toneHz) / 48000) * 10000);
      phase += samples.length;
      await source.captureFrame(new AudioFrame(samples, 48000, 1, 480));
      generatedFrames++;
      await delay(10);
    }
  })().catch((error) => {
    failures.push(`producer: ${safeError(error)}`);
    producing = false;
  });
}
async function stopSource() {
  const issuedAt = Date.now();
  const start = performance.now();
  producing = false;
  source?.clearQueue();
  await producer;
  const stoppedAt = Date.now();
  if (track) await track.close();
  else if (source) await source.close();
  sourceClosed = true;
  track = undefined;
  source = undefined;
  producer = undefined;
  lastSourceStop = {
    issuedAt,
    stoppedAt,
    localCaptureStopMs: performance.now() - start,
    generatedFrames,
  };
  return lastSourceStop;
}
async function leave() {
  const issuedAt = Date.now();
  const stopped = await stopSource();
  const outgoing = room;
  await outgoing?.disconnect();
  for (const reader of streams.values()) await reader.cancel();
  await Promise.allSettled([...jobs]);
  lastRoom = outgoing;
  room = undefined;
  await delay(80);
  return { issuedAt, disconnectedAt: Date.now(), sourceStop: stopped, diagnostic: diagnostic() };
}
async function command(action, value = {}) {
  if (action === 'connect') {
    const endpoint = new URL(value.url);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))
      throw new Error('Native fixture refuses remote SFU');
    if (room) throw new Error('Already connected');
    audio.length = 0;
    toneHz = value.toneHz;
    paused = false;
    room = new Room();
    room.on(RoomEvent.TrackSubscribed, (remoteTrack, _publication, participant) => {
      if (remoteTrack.kind === TrackKind.KIND_AUDIO) consume(remoteTrack, participant);
    });
    for (const event of [
      RoomEvent.Connected,
      RoomEvent.Disconnected,
      RoomEvent.Reconnecting,
      RoomEvent.Reconnected,
    ])
      room.on(event, () => events.push({ event, at: Date.now() }));
    const start = performance.now();
    await room.connect(value.url, value.token, { autoSubscribe: true });
    source = new AudioSource(48000, 1, 50);
    sourceClosed = false;
    track = LocalAudioTrack.createAudioTrack('approval-generated-microphone', source);
    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    await room.localParticipant.publishTrack(track, options);
    await startProducer();
    return {
      connectedAt: Date.now(),
      connectPublishMs: performance.now() - start,
      diagnostic: diagnostic(),
    };
  }
  if (action === 'stats')
    return { audio: sampleStats(value.since), diagnostic: diagnostic(), events: [...events] };
  if (action === 'rtcStats') {
    const stats = await room.getRtcStats();
    const selectedKinds = new Set([
      'transport',
      'candidatePair',
      'localCandidate',
      'remoteCandidate',
      'inboundRtp',
      'outboundRtp',
    ]);
    const select = (entries) =>
      entries.filter((entry) => selectedKinds.has(entry.stats.case)).map((entry) => entry.toJson());
    return {
      at: Date.now(),
      publisher: select(stats.publisherStats),
      subscriber: select(stats.subscriberStats),
      audio: sampleStats(),
      diagnostic: diagnostic(),
    };
  }
  if (action === 'pcmWindow') {
    const since = value.since ?? Date.now() - 450;
    return audio
      .filter((entry) => entry.at >= since)
      .map((entry) => ({ at: entry.at, samples: Array.from(entry.samples) }));
  }
  if (action === 'fdSnapshot') {
    const before = snapshotDescriptors();
    if (value.dropLastRoom) lastRoom = undefined;
    if (value.gc) {
      if (!globalThis.gc)
        throw new Error('This diagnostic process was not started with --expose-gc');
      globalThis.gc();
    }
    await delay(value.settleMs ?? 100);
    return {
      before,
      after: snapshotDescriptors(),
      lastRoomRetained: Boolean(lastRoom),
      diagnostic: diagnostic(),
      memory: process.memoryUsage(),
    };
  }
  if (action === 'pauseCapture') {
    const issuedAt = Date.now();
    paused = true;
    source?.clearQueue();
    return { issuedAt, pausedAt: Date.now(), generatedFrames };
  }
  if (action === 'resumeCapture') {
    paused = false;
    return { resumedAt: Date.now() };
  }
  if (action === 'reconnect') {
    const before = events.filter((entry) => entry.event === RoomEvent.Reconnected).length;
    const start = performance.now();
    await room.simulateScenario(
      value.full
        ? SimulateScenarioKind.SIMULATE_FULL_RECONNECT
        : SimulateScenarioKind.SIMULATE_SIGNAL_RECONNECT,
    );
    const deadline = Date.now() + 15000;
    while (events.filter((entry) => entry.event === RoomEvent.Reconnected).length === before) {
      if (Date.now() > deadline) throw new Error('Native reconnect event deadline exceeded');
      await delay(40);
    }
    return {
      reconnectMs: performance.now() - start,
      diagnostic: diagnostic(),
      events: [...events],
    };
  }
  if (action === 'leave') return leave();
  if (action === 'shutdown') {
    if (room || source) await leave();
    await dispose();
    return { diagnostic: diagnostic(), disposed: true };
  }
  throw new Error(`Unknown fixture command: ${action}`);
}
let serial = Promise.resolve();
process.on('message', (message) => {
  serial = serial.then(async () => {
    try {
      const result = await command(message.action, message.value);
      process.send?.({ id: message.id, ok: true, result });
      if (message.action === 'shutdown') process.disconnect();
    } catch (error) {
      process.send?.({ id: message.id, ok: false, error: safeError(error) });
    }
  });
});
process.send?.({ ready: true, pid: process.pid, baseline: diagnostic() });
