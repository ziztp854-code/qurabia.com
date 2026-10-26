// Local acceptance fixture: actual AudioSession + actual SDK; generated tone only.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Room,
  RoomEvent,
  Track,
  LogLevel,
  setLogLevel,
  type RemoteAudioTrack,
} from 'livekit-client';
import { AudioSession } from '../../apps/web/src/components/voice/audio-session';
import type { VoiceParticipant } from '../../apps/web/src/lib/voice/types';
import { analyzePcmTone } from './webrtc-audio-metric.mjs';
import { requestVoiceMediaToken } from '../../apps/web/src/components/voice/voice-media-token';

declare global {
  interface Window {
    fixture: { roomId: string; identity: string; persona: string; url: string; autoJoin: boolean };
    audioEvidence: Record<string, unknown>;
    collectPcmEvidence: () => Promise<Record<string, unknown>>;
    capturePlaybackSnapshot: (label: string) => Record<string, unknown>;
    playbackSnapshots: Record<string, unknown>[];
    fixtureTargetIdentity?: string;
  }
}

const fixture = window.fixture;
// Signaling URLs contain even local fixture JWTs; do not copy them into traces.
setLogLevel(LogLevel.silent);
const observedRooms = new Set<Room>();
const selectedAudio = () =>
  document.querySelector<HTMLAudioElement>(
    window.fixtureTargetIdentity
      ? `audio[data-voice-audio="${CSS.escape(window.fixtureTargetIdentity)}"]`
      : 'audio[data-voice-audio]',
  );
window.playbackSnapshots = [];
window.capturePlaybackSnapshot = (label) => {
  const audio = selectedAudio();
  const snapshot = {
    label,
    at: performance.now(),
    canPlaybackAudio: [...observedRooms].map((room) => room.canPlaybackAudio),
    sdkTracks: [...observedRooms].flatMap((room) =>
      [...room.remoteParticipants.values()].flatMap((remote) =>
        [...remote.audioTrackPublications.values()].map((publication) => ({
          sid: publication.trackSid,
          subscribed: publication.isSubscribed,
          trackMuted: publication.track?.isMuted,
          mediaTrackEnabled: publication.track?.mediaStreamTrack.enabled,
          sdkVolume: (publication.track as RemoteAudioTrack | undefined)?.getVolume(),
          attachedElements: publication.track?.attachedElements.map((element) => ({
            muted: element.muted,
            paused: element.paused,
            volume: element.volume,
            currentTime: element.currentTime,
            isActualVoiceElement: element.matches('audio[data-voice-audio]'),
          })),
        })),
      ),
    ),
    audio: audio
      ? {
          muted: audio.muted,
          paused: audio.paused,
          volume: audio.volume,
          currentTime: audio.currentTime,
          readyState: audio.readyState,
          trackLive:
            audio.srcObject instanceof MediaStream &&
            audio.srcObject.getAudioTracks().some((track) => track.readyState === 'live'),
        }
      : null,
  };
  window.playbackSnapshots.push(snapshot);
  return snapshot;
};
// Room.connect is an instance arrow function. Observe its real events passively
// through emit instead, preserving every argument and the original return value.
const nativeEmit = Room.prototype.emit;
Room.prototype.emit = function (...args: Parameters<Room['emit']>) {
  observedRooms.add(this);
  const result = nativeEmit.apply(this, args);
  if (args[0] === RoomEvent.AudioPlaybackStatusChanged || args[0] === RoomEvent.TrackSubscribed)
    queueMicrotask(() => window.capturePlaybackSnapshot(`sdk-${args[0]}`));
  return result;
};
for (const event of ['play', 'playing', 'pause', 'volumechange']) {
  document.addEventListener(
    event,
    (value) => {
      if (value.target instanceof HTMLAudioElement)
        window.capturePlaybackSnapshot(`element-${event}`);
    },
    true,
  );
}
const participant: VoiceParticipant = {
  id: fixture.identity,
  name: fixture.identity,
  image: null,
  role: fixture.persona === 'receiver-a' ? 'host' : 'listener',
  seatIndex: fixture.persona === 'receiver-a' ? 0 : null,
  requestedSeat: null,
  handRaised: false,
  muted: true,
  moderatorMuted: false,
  joinedAt: 1,
  lastSeenAt: 1,
};
window.audioEvidence = { frames: 0, rms: 0, toneRatio: 0, connected: false };
window.collectPcmEvidence = async () => {
  const audio = selectedAudio();
  if (!audio || audio.paused || audio.currentTime <= 0 || !(audio.srcObject instanceof MediaStream))
    throw new Error('PCM observation requires independently established HTML audio playback');
  const recorder = new MediaRecorder(audio.srcObject, { mimeType: 'audio/webm;codecs=opus' });
  const chunks: Blob[] = [];
  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onerror = () => reject(new Error('Local synthetic PCM recorder failed'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
  });
  const initialPlaybackTime = audio.currentTime;
  recorder.start();
  await new Promise<void>((resolve, reject) => {
    const inspectPlayback = () => {
      if (!audio.isConnected || audio.paused) {
        recorder.stop();
        reject(new Error('HTML playback stopped during PCM measurement'));
      } else if (audio.currentTime - initialPlaybackTime >= 0.6) {
        recorder.stop();
        resolve();
      } else requestAnimationFrame(inspectPlayback);
    };
    requestAnimationFrame(inspectPlayback);
  });
  // Offline decoding does not resume or unlock the receiver's live AudioContext.
  const decoder = new OfflineAudioContext(1, 48000, 48000);
  const decoded = await decoder.decodeAudioData(await (await recorded).arrayBuffer());
  const samples = decoded.getChannelData(0).slice(-8192);
  const result = analyzePcmTone(samples, decoded.sampleRate);
  window.audioEvidence = {
    frames: Math.floor(decoded.length / 128),
    samples: decoded.length,
    rms: result.rms,
    toneRatio: result.bandPower660,
    frequencyHz: result.frequencyHz,
    expectedHz: 660,
    playing: !audio.paused && audio.currentTime > 0,
    muted: audio.muted,
    volume: audio.volume,
    trackLive: audio.srcObject.getAudioTracks().some((track) => track.readyState === 'live'),
  };
  return window.audioEvidence;
};

function Listener() {
  const [joined, setJoined] = useState(fixture.autoJoin);
  const [state, setState] = useState('disconnected');
  const [deafened, setDeafened] = useState(false);
  return (
    <main>
      <h1>Late-join listener {fixture.identity}</h1>
      <button onClick={() => setJoined(true)}>Join listener</button>
      <button onClick={() => setDeafened((value) => !value)}>
        {deafened ? 'Undeafen' : 'Deafen'}
      </button>
      <output data-testid="connection-state">{state}</output>
      {joined && (
        <AudioSession
          roomId={fixture.roomId}
          participant={participant}
          muted
          deafened={deafened}
          onStateChange={setState}
        />
      )}
    </main>
  );
}

function Publisher() {
  const [state, setState] = useState('idle');
  const [publishedRoom, setPublishedRoom] = useState<Room | null>(null);
  return (
    <main>
      <h1>Late publisher</h1>
      <button
        onClick={async () => {
          try {
            const context = new AudioContext();
            await context.resume();
            const destination = context.createMediaStreamDestination();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 660;
            gain.gain.value = 0.2;
            oscillator.connect(gain).connect(destination);
            oscillator.start();
            const token = await requestVoiceMediaToken(
              fixture.roomId,
              new AbortController().signal,
            );
            const room = new Room();
            await room.connect(fixture.url, token.token, { autoSubscribe: true });
            const permissionsReady = room.localParticipant.permissions?.canPublish
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  const inspect = () => {
                    if (room.localParticipant.permissions?.canPublish) {
                      room.off(RoomEvent.ParticipantPermissionsChanged, inspect);
                      resolve();
                    }
                  };
                  room.on(RoomEvent.ParticipantPermissionsChanged, inspect);
                });
            const admitted = await fetch('/fixture/publisher-connected', { method: 'POST' });
            if (!admitted.ok) throw new Error('Local publisher control-plane hook failed');
            await permissionsReady;
            await room.localParticipant.publishTrack(destination.stream.getAudioTracks()[0], {
              source: Track.Source.Microphone,
              dtx: false,
              red: true,
            });
            setPublishedRoom(room);
            setState('published');
          } catch {
            setState('error');
          }
        }}
      >
        Publish tone
      </button>
      <button
        disabled={!publishedRoom}
        onClick={async () => {
          await publishedRoom?.disconnect();
          setState('disconnected');
        }}
      >
        Disconnect publisher
      </button>
      <output data-testid="publisher-state">{state}</output>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  fixture.persona.startsWith('late-publisher') ? <Publisher /> : <Listener />,
);
