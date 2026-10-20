import { fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { measureVoiceSignal } from './voice-audio-signal.mjs';

const requireWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));

/** A separate process keeps native SDK logs and all tokens out of build logs. */
export async function checkCloudAudio() {
  const { RoomServiceClient } = requireWeb('livekit-server-sdk');
  const roomName = `voice-cloud-media-check-${randomUUID()}`;
  const client = new RoomServiceClient(
    process.env.LIVEKIT_URL.replace(/^ws/, 'http'),
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { requestTimeout: 8, failover: false },
  );
  let created = false;
  try {
    await client.createRoom({ name: roomName, emptyTimeout: 30, maxParticipants: 5 });
    created = true;
    const result = await new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), [roomName], {
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      let report;
      const timer = setTimeout(() => child.kill('SIGKILL'), 45_000);
      child.on('message', (message) => {
        report = message;
      });
      child.on('error', () => {
        clearTimeout(timer);
        reject(new Error('Native audio check could not start'));
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0 && report?.phase === 'verify' && Array.isArray(report.paths)) {
          for (const path of report.paths) {
            // Only fixed labels and finite measurements cross the secret-bearing child boundary.
            if (
              !['B→A', 'A→B'].includes(path.direction) ||
              ![path.samples, path.rms, path.expectedHz, path.toneRatio].every(Number.isFinite)
            )
              continue;
            console.log(
              `[voice-cloud-audio] failed ${path.direction}: decoded ${path.samples} PCM samples, RMS ${path.rms}, expected ${path.expectedHz}Hz, tone ratio ${path.toneRatio}`,
            );
          }
        }
        if (
          code === 0 &&
          report?.ok &&
          report?.paths?.length === 2 &&
          report?.participants === 5 &&
          report?.serverData?.isolated
        )
          resolve(report);
        else
          reject(
            new Error(
              `Native audio check failed at ${['connect', 'subscribe', 'data', 'capture', 'verify', 'cleanup'].includes(report?.phase) ? report.phase : 'startup'}`,
            ),
          );
      });
    });
    console.log(
      `[voice-cloud-data] reliable server message reached only its authorized recipient in ${result.serverData.latencyMs}ms`,
    );
    for (const path of result.paths)
      console.log(
        `[voice-cloud-audio] ${path.direction}: decoded ${path.samples} PCM samples, RMS ${path.rms}, expected ${path.expectedHz}Hz, tone ratio ${path.toneRatio}`,
      );
    console.log(
      '[voice-cloud-audio] bidirectional WebRTC audio passed with five native clients (two speakers, three listeners); synthetic tones only',
    );
  } catch (error) {
    if (
      /^Native audio check (failed at (connect|subscribe|data|capture|verify|cleanup|startup)|could not start)$/.test(
        error.message,
      )
    )
      throw error;
    throw new Error('Cloud media check could not complete');
  } finally {
    if (created) {
      try {
        await client.deleteRoom(roomName);
      } catch {
        throw new Error('Cloud media test-room cleanup failed');
      }
    }
  }
}

async function runNativeClients(roomName) {
  const {
    AccessToken,
    RoomServiceClient,
    DataPacket_Kind,
    TrackSource: GrantSource,
  } = requireWeb('livekit-server-sdk');
  const rtc = await import('@livekit/rtc-node');
  const rooms = Array.from({ length: 5 }, () => new rtc.Room());
  const serverPackets = Array(5).fill(0);
  const marker = randomUUID();
  let serverData;
  const readers = [],
    sources = [],
    tracks = [];
  const received = [[], []];
  let collecting = false;
  let phase = 'connect';
  let report;
  let paths;
  try {
    for (let index = 0; index < 2; index++) {
      rooms[index].on(rtc.RoomEvent.DataReceived, (payload, sender, _kind, topic) => {
        if (sender || topic !== 'tahaddi-voice-message-v1') return;
        try {
          if (JSON.parse(new TextDecoder().decode(payload)).marker === marker)
            serverPackets[index]++;
        } catch {
          /* Ignore unrelated packets. */
        }
      });
      rooms[index].on(rtc.RoomEvent.TrackSubscribed, (track) => {
        if (index >= 2) return;
        if (track.kind !== rtc.TrackKind.KIND_AUDIO) return;
        const reader = new rtc.AudioStream(track, {
          sampleRate: 48_000,
          numChannels: 1,
        }).getReader();
        readers.push(reader);
        void (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (collecting && received[index].length < 240)
                received[index].push(Int16Array.from(value.data));
            }
          } catch {
            /* A disconnected test stream is checked by PCM verification. */
          }
        })();
      });
    }
    await Promise.all(
      rooms.map(async (room, index) => {
        const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
          identity: `synthetic-${index}`,
          ttl: 60,
        });
        token.addGrant({
          room: roomName,
          roomJoin: true,
          canPublish: index < 2,
          canSubscribe: true,
          canPublishData: false,
          canUpdateOwnMetadata: false,
          canPublishSources: [GrantSource.MICROPHONE],
        });
        await room.connect(process.env.LIVEKIT_URL, await token.toJwt(), {
          autoSubscribe: true,
          dynacast: true,
        });
      }),
    );
    phase = 'data';
    const service = new RoomServiceClient(
      process.env.LIVEKIT_URL.replace(/^ws/, 'http'),
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      { requestTimeout: 8, failover: false },
    );
    await delay(300);
    const started = Date.now();
    await service.sendData(
      roomName,
      new TextEncoder().encode(JSON.stringify({ marker })),
      DataPacket_Kind.RELIABLE,
      { topic: 'tahaddi-voice-message-v1', destinationIdentities: ['synthetic-1'] },
    );
    for (let attempt = 0; attempt < 50 && serverPackets[1] === 0; attempt++) await delay(100);
    const latencyMs = Date.now() - started;
    await delay(200);
    if (serverPackets.some((count, index) => count !== (index === 1 ? 1 : 0)))
      throw new Error('Server data recipient isolation failed');
    serverData = { isolated: true, latencyMs };
    phase = 'subscribe';
    await Promise.all(
      rooms.slice(0, 2).map(async (room, index) => {
        const source = new rtc.AudioSource(48_000, 1, 100);
        sources[index] = source;
        const track = rtc.LocalAudioTrack.createAudioTrack(`test-tone-${index}`, source);
        tracks.push(track);
        const options = new rtc.TrackPublishOptions();
        options.source = rtc.TrackSource.SOURCE_MICROPHONE;
        await room.localParticipant.publishTrack(track, options);
      }),
    );
    for (let attempt = 0; attempt < 100 && readers.length < 2; attempt++) await delay(100);
    if (readers.length !== 2) throw new Error('Both audio subscriptions are required');
    phase = 'capture';
    collecting = true;
    await Promise.all(
      sources.map(async (source, index) => {
        const frequency = index === 0 ? 440 : 660;
        for (let frameIndex = 0; frameIndex < 240; frameIndex++) {
          const data = Int16Array.from({ length: 480 }, (_, offset) =>
            Math.round(
              6000 * Math.sin((2 * Math.PI * frequency * (frameIndex * 480 + offset)) / 48_000),
            ),
          );
          await source.captureFrame(new rtc.AudioFrame(data, 48_000, 1, 480));
          await delay(10);
        }
        await source.waitForPlayout();
      }),
    );
    await delay(500);
    phase = 'verify';
    paths = received.map((frames, index) => {
      const samples = new Int16Array(frames.reduce((sum, frame) => sum + frame.length, 0));
      let offset = 0;
      for (const frame of frames) {
        samples.set(frame, offset);
        offset += frame.length;
      }
      return {
        direction: index === 0 ? 'B→A' : 'A→B',
        ...measureVoiceSignal(samples, index === 0 ? 660 : 440, index === 0 ? 440 : 660),
      };
    });
    if (paths.some((path) => !path.passed)) throw new Error('Expected tone was not decoded');
    report = { ok: true, paths, participants: rooms.length, serverData };
  } catch {
    report = { ok: false, phase, ...(phase === 'verify' && paths ? { paths } : {}) };
  } finally {
    await Promise.allSettled(readers.map((reader) => reader.cancel()));
    await Promise.allSettled(tracks.map((track) => track.close()));
    await Promise.allSettled(sources.map((source) => source.close()));
    await Promise.allSettled(rooms.map((room) => room.disconnect()));
    try {
      await rtc.dispose();
    } catch {
      report = { ok: false, phase: 'cleanup' };
    }
  }
  return report;
}

if (process.send && process.argv[2]?.startsWith('voice-cloud-media-check-')) {
  let report;
  try {
    report = await runNativeClients(process.argv[2]);
  } catch {
    report = { ok: false, phase: 'startup' };
  }
  process.send(report, () => process.exit(report.ok ? 0 : 1));
}
