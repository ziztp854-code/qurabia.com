'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  TrackEvent,
  type RemoteAudioTrack,
  type RemoteParticipant,
} from 'livekit-client';
import type { VoiceParticipant } from '@/lib/voice/types';
import { SoundCheck } from './sound-check';
import { VoiceConnectionCheck } from './voice-connection-check';
import { inspectVoiceConnection } from './voice-connection-report';
import { requestVoiceMediaToken, VoiceMediaTokenError } from './voice-media-token';
import { readVoiceLiveMessage, type VoiceLiveMessage } from './voice-live-message';
export type VoiceAudioHandle = { retry: () => void; startAudio: () => Promise<void>; stop: () => void };

export type VoiceAudioState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'setup-needed'
  | 'error'
  | 'tab-conflict';
type Props = {
  ref?: Ref<VoiceAudioHandle>;
  onErrorChange?: (error: string) => void;
  onPlaybackBlockedChange?: (blocked: boolean) => void;
  roomId: string;
  participant: VoiceParticipant | null;
  muted?: boolean;
  deafened?: boolean;
  volume?: number;
  mutedUserIds?: string[];
  onStateChange?: (state: VoiceAudioState) => void;
  onSpeakersChange?: (identities: string[]) => void;
  onRoomChanged?: () => void;
  onRoomMessage?: (packet: VoiceLiveMessage) => void;
};
const STATE_LABEL: Record<VoiceAudioState, string> = {
  connecting: 'جارٍ الاتصال بالصوت…',
  connected: 'متصل بالصوت',
  reconnecting: 'جارٍ إعادة الاتصال…',
  disconnected: 'الصوت غير متصل',
  'setup-needed': 'الصوت يحتاج إعداد الخدمة',
  error: 'تعذّر الاتصال بالصوت',
  'tab-conflict': 'الصوت مفتوح في علامة تبويب أخرى',
};

export function AudioSession({
  roomId,
  participant,
  muted = true,
  deafened = false,
  volume = 1,
  mutedUserIds = [],
  onStateChange,
  onSpeakersChange,
  onRoomChanged,
  onRoomMessage,
  onErrorChange,
  onPlaybackBlockedChange,
  ref,
}: Props) {
  const roomRef = useRef<Room | null>(null);
  const stopped = useRef(false);
  const stopSession = useRef<() => void>(() => {});
  const recoveryAttempts = useRef(0);
  const micQueue = useRef<Promise<void>>(Promise.resolve());
  const tracks = useRef(
    new Map<RemoteAudioTrack, {
      element: HTMLMediaElement;
      identity: string;
      blocked: boolean;
      stopPlaybackWatch: () => void;
    }>(),
  );
  const callbacks = useRef({
    onStateChange,
    onSpeakersChange,
    onRoomChanged,
    onRoomMessage,
    onErrorChange,
    onPlaybackBlockedChange,
  });
  const playback = useRef({ deafened, volume, mutedUserIds });
  const [state, setState] = useState<VoiceAudioState>('disconnected');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [permissionsRevision, setPermissionsRevision] = useState(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState('default');
  const [outputId, setOutputId] = useState('default');
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [canSelectOutput, setCanSelectOutput] = useState(false);
  const participantId = participant?.id;
  const applyPlaybackPreferences = useCallback(() => {
    const current = playback.current;
    for (const { element, identity } of tracks.current.values()) {
      element.volume = Math.max(0, Math.min(1, current.volume));
      element.muted = current.deafened || current.mutedUserIds.includes(identity);
    }
  }, []);
  const updatePlaybackBlocked = useCallback(() => {
    const room = roomRef.current;
    const current = playback.current;
    const blockedTrack = [...tracks.current.values()].some(({ blocked, identity }) =>
      blocked && !current.deafened && !current.mutedUserIds.includes(identity),
    );
    setAudioBlocked(Boolean(room && (!room.canPlaybackAudio || blockedTrack)));
  }, []);
  const retryAudio = useCallback(() => {
    if (stopped.current) return;
    recoveryAttempts.current = 0;
    setRetry((n) => n + 1);
  }, []);
  const startAudio = useCallback(async () => {
    try {
      const pending = roomRef.current?.startAudio();
      // The SDK unmutes every attached element synchronously when unlocking.
      // Keep deafen and individual member mutes in force during that attempt.
      applyPlaybackPreferences();
      await pending;
      for (const [track, entry] of tracks.current) {
        if (!entry.element.paused) tracks.current.set(track, { ...entry, blocked: false });
      }
      applyPlaybackPreferences();
      updatePlaybackBlocked();
    } catch {
      setError('اضغط للسماح بتشغيل الصوت في المتصفح.');
    }
  }, [applyPlaybackPreferences, updatePlaybackBlocked]);
  const stop = useCallback(() => {
    stopped.current = true;
    stopSession.current();
    setState('disconnected');
  }, []);
  useImperativeHandle(ref, () => ({ retry: retryAudio, startAudio, stop }), [retryAudio, startAudio, stop]);
  useEffect(() => {
    callbacks.current.onErrorChange?.(error);
  }, [error]);
  useEffect(() => {
    callbacks.current.onPlaybackBlockedChange?.(audioBlocked);
  }, [audioBlocked]);

  const getMicrophoneTrack = useCallback(
    () =>
      roomRef.current?.localParticipant.getTrackPublication?.(Track.Source.Microphone)?.track
        ?.mediaStreamTrack,
    [],
  );
  const canPublish = Boolean(
    participant &&
    participant.seatIndex !== null &&
    participant.role !== 'listener' &&
    !participant.moderatorMuted,
  );
  useEffect(() => {
    callbacks.current = {
      onStateChange,
      onSpeakersChange,
      onRoomChanged,
      onRoomMessage,
      onErrorChange,
      onPlaybackBlockedChange,
    };
  }, [
    onStateChange,
    onSpeakersChange,
    onRoomChanged,
    onRoomMessage,
    onErrorChange,
    onPlaybackBlockedChange,
  ]);
  useEffect(() => {
    callbacks.current.onStateChange?.(state);
  }, [state]);
  useEffect(() => {
    playback.current = { deafened, volume, mutedUserIds };
    applyPlaybackPreferences();
    updatePlaybackBlocked();
  }, [deafened, volume, mutedUserIds, applyPlaybackPreferences, updatePlaybackBlocked]);

  useEffect(() => {
    if (!participantId || stopped.current) return;
    let disposed = false;
    let releaseLock: (() => void) | undefined;
    let leaseTimer: ReturnType<typeof setInterval> | undefined;
    let room: Room | undefined;
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
    let intentionalDisconnect = false;
    const abort = new AbortController();
    const owner = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const leaseKey = 'tahaddi-voice-session';
    const attached = tracks.current;
    const changeState = (next: VoiceAudioState) => {
      if (!disposed) setState(next);
    };
    const recover = () => {
      if (disposed || recoveryTimer) return;
      if (recoveryAttempts.current >= 4) {
        setError('تعذر استعادة اتصال الصوت. تحقق من الشبكة ثم اضغط إعادة الاتصال.');
        changeState('error');
        return;
      }
      const delay = [1000, 2000, 4000, 8000][recoveryAttempts.current++];
      changeState('reconnecting');
      recoveryTimer = setTimeout(() => {
        if (!disposed) setRetry((n) => n + 1);
      }, delay);
    };
    const refreshDevices = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!disposed) setDevices(list);
      } catch {
        /* Device controls are optional. */
      }
    };
    const connect = async () => {
      try {
        setError('');
        setAudioBlocked(false);
        changeState('connecting');
        const payload = await requestVoiceMediaToken(roomId, abort.signal);
        if (disposed) return;
        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          publishDefaults: { dtx: true, red: true, stopMicTrackOnMute: true },
        });
        roomRef.current = room;
        micQueue.current = Promise.resolve();
        room.on(RoomEvent.DataReceived, (payload, sender, _kind, topic) => {
          // Only server-origin data can update chat or invalidate authoritative state.
          if (disposed || sender) return;
          if (topic === 'tahaddi-voice-message-v1') {
            const packet = readVoiceLiveMessage(payload, roomId);
            if (packet) callbacks.current.onRoomMessage?.(packet);
            return;
          }
          if (topic !== 'tahaddi-voice-refresh-v1' || payload.length > 512) return;
          try {
            const value = JSON.parse(new TextDecoder().decode(payload));
            if (value.roomId === roomId && Number.isSafeInteger(value.cursor))
              callbacks.current.onRoomChanged?.();
          } catch {
            /* Ignore malformed data. */
          }
        });
        room.on(RoomEvent.TrackSubscribed, (track, _publication, remote: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio || disposed) return;
          const audioTrack = track as RemoteAudioTrack;
          const element = audioTrack.attach();
          const current = playback.current;
          element.volume = Math.max(0, Math.min(1, current.volume));
          element.muted = current.deafened || current.mutedUserIds.includes(remote.identity);
          element.autoplay = true;
          element.dataset.voiceAudio = remote.identity;
          element.style.display = 'none';
          document.body.appendChild(element);
          const recordPlayback = (blocked: boolean) => {
            const entry = attached.get(audioTrack);
            if (disposed || !entry) return;
            attached.set(audioTrack, { ...entry, blocked });
            updatePlaybackBlocked();
          };
          const started = () => recordPlayback(false);
          const failed = () => recordPlayback(true);
          audioTrack.on(TrackEvent.AudioPlaybackStarted, started);
          audioTrack.on(TrackEvent.AudioPlaybackFailed, failed);
          attached.set(audioTrack, {
            element,
            identity: remote.identity,
            blocked: false,
            stopPlaybackWatch: () => {
              audioTrack.off(TrackEvent.AudioPlaybackStarted, started);
              audioTrack.off(TrackEvent.AudioPlaybackFailed, failed);
            },
          });
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const audioTrack = track as RemoteAudioTrack;
          attached.get(audioTrack)?.stopPlaybackWatch();
          audioTrack.detach().forEach((element) => element.remove());
          attached.delete(audioTrack);
          if (!disposed) updatePlaybackBlocked();
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) =>
          callbacks.current.onSpeakersChange?.(speakers.map((s) => s.identity)),
        );
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!disposed) updatePlaybackBlocked();
        });
        room.on(RoomEvent.Reconnecting, () => {
          callbacks.current.onSpeakersChange?.([]);
          changeState('reconnecting');
        });
        room.on(RoomEvent.Reconnected, () => changeState('connected'));
        room.on(RoomEvent.Disconnected, (reason) => {
          if (disposed || intentionalDisconnect) return;
          callbacks.current.onSpeakersChange?.([]);
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
            changeState('tab-conflict');
            setError('جلسة الصوت مفتوحة باسم حسابك في نافذة أخرى.');
            return;
          }
          // Cloud permission changes disconnect the old grant. Obtain a fresh,
          // server-authorized token; removed members are refused by the token API.
          recover();
        });
        room.on(RoomEvent.MediaDevicesChanged, refreshDevices);
        room.on(RoomEvent.ParticipantPermissionsChanged, (_previous, changed) => {
          if (!disposed && changed.identity === participantId)
            setPermissionsRevision((value) => value + 1);
        });
        room.on(RoomEvent.MediaDevicesError, () => {
          if (!disposed) setError('تعذّر الوصول إلى الميكروفون. راجع إذن المتصفح وإعدادات الجهاز.');
        });
        await room.connect(payload.url, payload.token, { autoSubscribe: true });
        if (disposed) {
          await room.disconnect();
          return;
        }
        recoveryAttempts.current = 0;
        changeState('connected');
        updatePlaybackBlocked();
        setCanSelectOutput('setSinkId' in HTMLMediaElement.prototype);
        await refreshDevices();
      } catch (cause) {
        if (disposed || abort.signal.aborted) return;
        intentionalDisconnect = true;
        await room?.disconnect();
        if (cause instanceof VoiceMediaTokenError) {
          setError(cause.message);
          if (cause.code === 'MEDIA_SETUP_REQUIRED') {
            changeState('setup-needed');
            return;
          }
          if ([400, 401, 403, 404, 410].includes(cause.status)) {
            changeState('error');
            return;
          }
        } else setError('تعذّر الاتصال بخدمة الصوت. جارٍ إعادة المحاولة تلقائيًا.');
        recover();
      }
    };
    const start = async () => {
      if (!navigator.mediaDevices || !window.isSecureContext) {
        setError('الصوت يتطلب متصفحًا حديثًا واتصال HTTPS آمنًا.');
        changeState('error');
        return;
      }
      if (navigator.locks) {
        let acquired = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          await navigator.locks.request(
            leaseKey,
            { mode: 'exclusive', ifAvailable: true },
            async (lock) => {
              if (!lock || disposed) return;
              acquired = true;
              const untilRelease = new Promise<void>((resolve) => {
                releaseLock = resolve;
              });
              await connect();
              await untilRelease;
            },
          );
          if (acquired || disposed) return;
          // React cleanup and the browser's lock release complete asynchronously.
          if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
        }
        changeState('tab-conflict');
      } else {
        // Lease fallback for browsers without Web Locks; fail closed when storage is unavailable.
        try {
          const current = JSON.parse(localStorage.getItem(leaseKey) || 'null') as {
            owner: string;
            until: number;
          } | null;
          if (current && current.until > Date.now()) {
            changeState('tab-conflict');
            return;
          }
          const renew = () =>
            localStorage.setItem(leaseKey, JSON.stringify({ owner, until: Date.now() + 10_000 }));
          renew();
          await new Promise((resolve) => setTimeout(resolve, 80));
          if (disposed) return;
          if (JSON.parse(localStorage.getItem(leaseKey) || '{}').owner !== owner) {
            changeState('tab-conflict');
            return;
          }
          leaseTimer = setInterval(() => {
            try {
              if (JSON.parse(localStorage.getItem(leaseKey) || '{}').owner !== owner) {
                void room?.disconnect();
                changeState('tab-conflict');
                clearInterval(leaseTimer);
              } else renew();
            } catch {
              void room?.disconnect();
              changeState('error');
            }
          }, 3000);
          await connect();
        } catch {
          setError('تعذّر حماية جلسة الصوت. اسمح بتخزين بيانات الموقع ثم أعد المحاولة.');
          changeState('error');
        }
      }
    };
    void start().catch(() => {
      if (!disposed) {
        setError('تعذّر فتح جلسة الصوت. أعد المحاولة من متصفح يدعم الصوت الآمن.');
        changeState('error');
      }
    });
    const dispose = () => {
      if (disposed) return;
      const microphone = getMicrophoneTrack();
      if (microphone) {
        microphone.enabled = false;
        microphone.stop();
      }
      disposed = true;
      abort.abort();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      releaseLock?.();
      if (leaseTimer) clearInterval(leaseTimer);
      try {
        if (JSON.parse(localStorage.getItem(leaseKey) || '{}').owner === owner)
          localStorage.removeItem(leaseKey);
      } catch {
        /* Optional fallback storage. */
      }
      callbacks.current.onSpeakersChange?.([]);
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        void room.disconnect(true);
      }
      for (const [track, { element, stopPlaybackWatch }] of attached) {
        stopPlaybackWatch();
        track.detach();
        element.remove();
      }
      attached.clear();
    };
    stopSession.current = dispose;
    return dispose;
  }, [roomId, participantId, retry, getMicrophoneTrack, updatePlaybackBlocked]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || state !== 'connected' || room.state !== ConnectionState.Connected) return;
    let cancelled = false;
    // Stop capture immediately, even if an earlier device operation is still pending.
    const track = getMicrophoneTrack();
    if (track && (muted || !canPublish)) track.enabled = false;
    // Serialize rapid mute/device changes so an older async enable cannot finish last.
    micQueue.current = micQueue.current
      .catch(() => {})
      .then(async () => {
        if (cancelled || stopped.current || room.state !== ConnectionState.Connected) return;
        await room.localParticipant.setMicrophoneEnabled(
          canPublish && !muted && Boolean(room.localParticipant.permissions?.canPublish),
          {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            deviceId: inputId,
          },
        );
        if (cancelled || stopped.current) await room.localParticipant.setMicrophoneEnabled(false);
        else {
          const track = getMicrophoneTrack();
          if (track)
            track.enabled =
              canPublish && !muted && Boolean(room.localParticipant.permissions?.canPublish);
        }
        if (!cancelled) setError('');
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(list);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause?.name === 'NotAllowedError'
              ? 'لم يُسمح باستخدام الميكروفون. فعّل الإذن من إعدادات المتصفح.'
              : 'تعذّر تشغيل الميكروفون. تحقق من توصيله وأذوناته.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [muted, canPublish, inputId, state, permissionsRevision, getMicrophoneTrack]);

  async function switchDevice(kind: 'audioinput' | 'audiooutput', id: string) {
    try {
      await roomRef.current?.switchActiveDevice(kind, id);
      if (kind === 'audioinput') setInputId(id);
      else setOutputId(id);
      setError('');
    } catch {
      setError('تعذّر تبديل جهاز الصوت. قد لا يدعم المتصفح هذا الخيار.');
    }
  }
  return (
    <section className="voice-audio-session" aria-label="اتصال الصوت">
      <div role="status" aria-live="polite" data-audio-state={state}>
        {STATE_LABEL[state]}
      </div>
      {error && <p role="alert">{error}</p>}
      {['error', 'disconnected', 'tab-conflict', 'setup-needed'].includes(state) && (
        <button type="button" onClick={retryAudio}>
          إعادة المحاولة
        </button>
      )}
      {audioBlocked && state === 'connected' && (
        <button type="button" onClick={() => void startAudio()}>
          تفعيل الاستماع
        </button>
      )}
      <VoiceConnectionCheck
        key={`${roomId}:${state}:${canPublish}:${muted}:${audioBlocked}`}
        inspect={() => inspectVoiceConnection(roomRef.current, canPublish && !muted, audioBlocked)}
      />
      {participant && (
        <SoundCheck
          inputId={inputId}
          outputId={outputId}
          roomMicActive={canPublish && !muted}
          getMicrophoneTrack={getMicrophoneTrack}
        />
      )}
      {state === 'connected' && (
        <details>
          <summary>أجهزة الصوت</summary>
          {canPublish && (
            <label>
              الميكروفون
              <select
                aria-label="اختيار الميكروفون"
                value={inputId}
                onChange={(event) => {
                  void switchDevice('audioinput', event.target.value);
                }}
              >
                <option value="default">الجهاز الافتراضي</option>
                {devices
                  .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
                  .map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `ميكروفون ${i + 1}`}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {canSelectOutput && (
            <label>
              السماعة
              <select
                aria-label="اختيار السماعة"
                value={outputId}
                onChange={(event) => {
                  void switchDevice('audiooutput', event.target.value);
                }}
              >
                <option value="default">الجهاز الافتراضي</option>
                {devices
                  .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default')
                  .map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `سماعة ${i + 1}`}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </details>
      )}
    </section>
  );
}
