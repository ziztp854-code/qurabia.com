'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteAudioTrack,
  type RemoteParticipant,
} from 'livekit-client';
import type { VoiceParticipant } from '@/lib/voice/types';

export type VoiceAudioState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'setup-needed'
  | 'error'
  | 'tab-conflict';
type Props = {
  roomId: string;
  participant: VoiceParticipant | null;
  muted?: boolean;
  deafened?: boolean;
  volume?: number;
  mutedUserIds?: string[];
  onStateChange?: (state: VoiceAudioState) => void;
  onSpeakersChange?: (identities: string[]) => void;
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
}: Props) {
  const roomRef = useRef<Room | null>(null);
  const micQueue = useRef<Promise<void>>(Promise.resolve());
  const tracks = useRef(
    new Map<RemoteAudioTrack, { element: HTMLMediaElement; identity: string }>(),
  );
  const callbacks = useRef({ onStateChange, onSpeakersChange });
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
  const canPublish = Boolean(
    participant &&
    participant.seatIndex !== null &&
    participant.role !== 'listener' &&
    !participant.moderatorMuted,
  );
  useEffect(() => {
    callbacks.current = { onStateChange, onSpeakersChange };
  }, [onStateChange, onSpeakersChange]);
  useEffect(() => {
    callbacks.current.onStateChange?.(state);
  }, [state]);
  useEffect(() => {
    playback.current = { deafened, volume, mutedUserIds };
    for (const { element, identity } of tracks.current.values()) {
      element.volume = Math.max(0, Math.min(1, volume));
      element.muted = deafened || mutedUserIds.includes(identity);
    }
  }, [deafened, volume, mutedUserIds]);

  useEffect(() => {
    if (!participantId) return;
    let disposed = false;
    let releaseLock: (() => void) | undefined;
    let leaseTimer: ReturnType<typeof setInterval> | undefined;
    let room: Room | undefined;
    const abort = new AbortController();
    const owner = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const leaseKey = 'tahaddi-voice-session';
    const attached = tracks.current;
    const changeState = (next: VoiceAudioState) => {
      if (!disposed) setState(next);
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
      let publicError = '';
      try {
        setError('');
        changeState('connecting');
        const response = await fetch(`/api/voice/rooms/${encodeURIComponent(roomId)}/token`, {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const payload = await response.json();
        if (!response.ok) {
          if (payload.code === 'MEDIA_SETUP_REQUIRED') {
            changeState('setup-needed');
            setError(payload.error);
            return;
          }
          publicError = payload.error || 'تعذّر الحصول على صلاحية الصوت.';
          throw new Error('TokenRequestFailed');
        }
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
          attached.set(audioTrack, { element, identity: remote.identity });
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const audioTrack = track as RemoteAudioTrack;
          audioTrack.detach().forEach((element) => element.remove());
          attached.delete(audioTrack);
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) =>
          callbacks.current.onSpeakersChange?.(speakers.map((s) => s.identity)),
        );
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!disposed) setAudioBlocked(!room!.canPlaybackAudio);
        });
        room.on(RoomEvent.Reconnecting, () => {
          callbacks.current.onSpeakersChange?.([]);
          changeState('reconnecting');
        });
        room.on(RoomEvent.Reconnected, () => changeState('connected'));
        room.on(RoomEvent.Disconnected, () => {
          callbacks.current.onSpeakersChange?.([]);
          changeState('disconnected');
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
        changeState('connected');
        setAudioBlocked(!room.canPlaybackAudio);
        setCanSelectOutput('setSinkId' in HTMLMediaElement.prototype);
        await refreshDevices();
      } catch {
        if (disposed || abort.signal.aborted) return;
        setError(publicError || 'تعذّر الاتصال بخدمة الصوت. تحقق من الشبكة ثم أعد المحاولة.');
        changeState('error');
        await room?.disconnect();
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
    return () => {
      disposed = true;
      abort.abort();
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
      for (const [track, { element }] of attached) {
        track.detach();
        element.remove();
      }
      attached.clear();
    };
  }, [roomId, participantId, retry]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || state !== 'connected' || room.state !== ConnectionState.Connected) return;
    let cancelled = false;
    // Serialize rapid mute/device changes so an older async enable cannot finish last.
    micQueue.current = micQueue.current
      .catch(() => {})
      .then(async () => {
        if (cancelled || room.state !== ConnectionState.Connected) return;
        await room.localParticipant.setMicrophoneEnabled(
          canPublish && !muted && Boolean(room.localParticipant.permissions?.canPublish),
          {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            deviceId: inputId,
          },
        );
        if (cancelled) await room.localParticipant.setMicrophoneEnabled(false);
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
  }, [muted, canPublish, inputId, state, permissionsRevision]);

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
        <button type="button" onClick={() => setRetry((n) => n + 1)}>
          إعادة المحاولة
        </button>
      )}
      {audioBlocked && state === 'connected' && (
        <button
          type="button"
          onClick={() => {
            void roomRef.current
              ?.startAudio()
              .catch(() => setError('اضغط للسماح بتشغيل الصوت في المتصفح.'));
          }}
        >
          تفعيل الاستماع
        </button>
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
