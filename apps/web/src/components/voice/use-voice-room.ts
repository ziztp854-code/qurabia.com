'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceCommand, VoiceRoomResponse, VoiceRoomSnapshot } from '@/lib/voice/contracts';
import { VOICE_POLL_INTERVAL } from '@/lib/voice/contracts';
import { VoiceAudioMesh } from './audio-mesh';
import { EntranceQueue, type EntranceAnnouncement } from './entrance-queue';

type VoiceAction = VoiceCommand extends infer Command
  ? Command extends VoiceCommand
    ? Omit<Command, 'clientId' | 'cursor'>
    : never
  : never;
const ERROR_TEXT: Record<string, string> = {
  UNAUTHORIZED: 'انتهت جلستك. سجّل الدخول مجددًا.',
  FORBIDDEN: 'لا تملك صلاحية هذا الإجراء.',
  ROOM_NOT_FOUND: 'الغرفة غير موجودة أو أُغلقت.',
  ROOM_CLOSED: 'أغلق المضيف الغرفة.',
  ROOM_FULL: 'اكتمل عدد المشاركين في الغرفة.',
  BLOCKED: 'لا يمكنك دخول هذه الغرفة.',
  RATE_LIMITED: 'طلبات كثيرة؛ انتظر قليلًا ثم حاول.',
  SEAT_UNAVAILABLE: 'هذا المقعد مشغول الآن.',
  MODERATOR_MUTED: 'أوقف المشرف الميكروفون مؤقتًا.',
};

export function useVoiceRoom(roomId: string) {
  const [room, setRoom] = useState<VoiceRoomSnapshot | null>(null);
  const [status, setStatus] = useState<'joining' | 'connected' | 'reconnecting' | 'left'>(
    'joining',
  );
  const [error, setError] = useState('');
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [subduedEffects, setSubduedEffects] = useState(false);
  const [announcement, setAnnouncement] = useState<EntranceAnnouncement | null>(null);
  const [turnConfigured, setTurnConfigured] = useState(false);
  const clientId = useRef('');
  const deferredLeave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursor = useRef(0);
  const current = useRef<VoiceRoomSnapshot | null>(null);
  const mesh = useRef<VoiceAudioMesh | null>(null);
  const active = useRef(false);
  const initial = useRef(true);
  const queue = useRef(new EntranceQueue());
  const enabled = useRef(effectsEnabled);
  const currentAnnouncement = useRef<EntranceAnnouncement | null>(null);
  const commandRef = useRef<(action: VoiceAction) => Promise<VoiceRoomResponse | null>>(
    async () => null,
  );

  const applyResponse = useCallback(async (response: VoiceRoomResponse, waitForAudio = true) => {
    if (!active.current) return;
    const previous = current.current;
    const next = previous && previous.revision > response.room.revision ? previous : response.room;
    current.current = next;
    cursor.current = Math.max(cursor.current, response.room.cursor);
    setRoom(next);
    setTurnConfigured(response.turnConfigured);
    setStatus(next.status === 'OPEN' ? 'connected' : 'left');
    const self = next.members.find((member) => member.id === next.selfMemberId);
    if (!self || self.seat === null || self.muted || next.status !== 'OPEN')
      setMicrophoneActive(false);
    const events = response.room.entrances.map((event) => ({
      id: event.id,
      createdAt: event.at,
      name: event.identity.name,
      avatarUrl: event.identity.avatarUrl,
      tier: event.identity.effect?.tier ?? 'ordinary',
      badge: event.identity.primaryBadge?.name,
      badgeId: event.identity.primaryBadge?.id,
      effectAssetUrl: event.identity.effect?.assetUrl,
      badgeAssetUrl: event.identity.primaryBadge?.assetUrl,
    }));
    queue.current.ingest(events, Date.now(), !initial.current && enabled.current);
    initial.current = false;
    const pendingAudio = mesh.current?.sync(
      { ...next, signals: response.room.signals },
      response.iceServers,
    );
    if (waitForAudio) await pendingAudio;
    else void pendingAudio?.catch(() => undefined);
  }, []);

  const command = useCallback(
    async (action: VoiceAction): Promise<VoiceRoomResponse | null> => {
      if (!active.current || !clientId.current) return null;
      const requestClientId = clientId.current;
      try {
        const response = await fetch(`/api/voice/${encodeURIComponent(roomId)}`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...action, clientId: clientId.current, cursor: cursor.current }),
          signal: AbortSignal.timeout(10000),
        });
        const result = await response.json();
        if (requestClientId !== clientId.current || !active.current) return null;
        if (!response.ok || !result.ok) {
          if (
            (action.type === 'heartbeat' || action.type === 'join') &&
            ([401, 403, 404, 410].includes(response.status) ||
              result.code === 'MEMBERSHIP_REQUIRED')
          ) {
            mesh.current?.dispose();
            active.current = false;
            setMicrophoneActive(false);
            setStatus('left');
          }
          const message = String(result.code ?? 'REQUEST_FAILED');
          throw new Error(
            ERROR_TEXT[message] ??
              (typeof result.error === 'string'
                ? result.error
                : 'تعذّر تنفيذ الطلب. حدّث الصفحة أو حاول مجددًا.'),
          );
        }
        await applyResponse(result as VoiceRoomResponse, action.type !== 'signal');
        return result as VoiceRoomResponse;
      } catch (reason) {
        if (requestClientId === clientId.current) {
          setError(reason instanceof Error ? reason.message : 'تعذّر الاتصال بالغرفة.');
          if (active.current && (action.type === 'heartbeat' || action.type === 'join')) {
            mesh.current?.stopMicrophone();
            setMicrophoneActive(false);
            setStatus('reconnecting');
          }
        }
        return null;
      }
    },
    [applyResponse, roomId],
  );

  useEffect(() => {
    commandRef.current = command;
  }, [command]);
  useEffect(() => {
    enabled.current = effectsEnabled;
    if (!effectsEnabled) {
      queue.current.clear();
      currentAnnouncement.current = null;
    }
  }, [effectsEnabled]);

  useEffect(() => {
    if (deferredLeave.current) {
      clearTimeout(deferredLeave.current);
      deferredLeave.current = null;
    }
    active.current = true;
    initial.current = true;
    cursor.current = 0;
    current.current = null;
    queue.current = new EntranceQueue();
    clientId.current ||= crypto.randomUUID();
    const lifecycleClientId = clientId.current;
    mesh.current = new VoiceAudioMesh({
      send: async (targetMemberId, kind, payload) => {
        const result = await commandRef.current({ type: 'signal', targetMemberId, kind, payload });
        if (!result) throw new Error('تعذّر إرسال بيانات الاتصال.');
      },
      remote: (memberId, stream) => {
        if (!active.current) return;
        setRemoteStreams((old) => {
          const next = { ...old };
          if (stream) next[memberId] = stream;
          else delete next[memberId];
          return next;
        });
      },
      speaking: (memberId, value) => {
        if (active.current)
          setSpeaking((old) => (old[memberId] === value ? old : { ...old, [memberId]: value }));
      },
      error: (message) => {
        if (active.current) setError(message);
      },
    });
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const device = navigator as Navigator & { deviceMemory?: number };
    const onMotion = () =>
      setSubduedEffects(
        media.matches ||
          (device.deviceMemory !== undefined && device.deviceMemory <= 2) ||
          (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2),
      );
    onMotion();
    media.addEventListener('change', onMotion);
    void fetch('/api/community/me')
      .then((response) => response.json())
      .then((result) => {
        if (!active.current) return;
        const settings = result.data?.settings ?? result.settings;
        if (settings) {
          setEffectsEnabled(settings.entranceEnabled);
          if (settings.reduceEffects) setSubduedEffects(true);
        }
      })
      .catch(() => undefined);
    let stopped = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const heartbeat = async () => {
      if (stopped || !active.current) return;
      const result = await commandRef.current({ type: initial.current ? 'join' : 'heartbeat' });
      if (result?.room.status === 'CLOSED') return;
      if (!stopped)
        poll = setTimeout(() => {
          void heartbeat();
        }, VOICE_POLL_INTERVAL);
    };
    void heartbeat();
    const leaveOnPageHide = () => {
      mesh.current?.dispose();
      void fetch(`/api/voice/${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'leave', clientId: lifecycleClientId }),
        keepalive: true,
      }).catch(() => undefined);
    };
    window.addEventListener('pagehide', leaveOnPageHide);
    let clearEffect: ReturnType<typeof setTimeout> | undefined;
    const effectTimer = setInterval(() => {
      if (currentAnnouncement.current || !enabled.current) return;
      const next = queue.current.next(Date.now());
      if (!next) return;
      currentAnnouncement.current = next;
      setAnnouncement(next);
      clearEffect = setTimeout(() => {
        currentAnnouncement.current = null;
        setAnnouncement(null);
      }, 2400);
    }, 350);
    return () => {
      stopped = true;
      active.current = false;
      if (poll) clearTimeout(poll);
      clearInterval(effectTimer);
      if (clearEffect) clearTimeout(clearEffect);
      window.removeEventListener('pagehide', leaveOnPageHide);
      media.removeEventListener('change', onMotion);
      mesh.current?.dispose();
      mesh.current = null;
      deferredLeave.current = setTimeout(leaveOnPageHide, 50);
      queue.current.clear();
    };
  }, [roomId]);

  const toggleMicrophone = async () => {
    const self = current.current?.members.find(
      (member) => member.id === current.current?.selfMemberId,
    );
    if (!self || self.seat === null) {
      setError('اطلب الصعود إلى المايك وانتظر موافقة المضيف.');
      return;
    }
    if (self.mutedByModerator) {
      setError('الميكروفون موقوف من المشرف؛ اطلب السماح أولًا.');
      return;
    }
    setError('');
    if (microphoneActive) {
      mesh.current?.stopMicrophone();
      setMicrophoneActive(false);
      await command({ type: 'mute', memberId: self.id, muted: true });
      return;
    }
    const allowed = await command({ type: 'mute', memberId: self.id, muted: false });
    if (!allowed) return;
    try {
      await mesh.current?.startMicrophone();
      if (active.current) setMicrophoneActive(mesh.current?.microphoneActive ?? false);
    } catch (reason) {
      mesh.current?.stopMicrophone();
      setMicrophoneActive(false);
      await command({ type: 'mute', memberId: self.id, muted: true });
      setError(
        reason instanceof DOMException && reason.name === 'NotAllowedError'
          ? 'اسمح بالميكروفون من إعدادات المتصفح، ثم حاول مجددًا.'
          : reason instanceof Error
            ? reason.message
            : 'تعذّر تشغيل الميكروفون.',
      );
    }
  };

  const leave = async () => {
    mesh.current?.dispose();
    setMicrophoneActive(false);
    setRemoteStreams({});
    await command({ type: 'leave' });
    active.current = false;
    setStatus('left');
  };

  const toggleEffects = async () => {
    const next = !effectsEnabled;
    setEffectsEnabled(next);
    try {
      const response = await fetch('/api/community/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entranceEnabled: next }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('SAVE_FAILED');
    } catch {
      setError('تغيّر العرض لهذه الجلسة؛ تعذّر حفظ تفضيل المؤثرات.');
    }
  };

  const resumePlayback = () => mesh.current?.resumePlayback();

  return {
    resumePlayback,
    room,
    status,
    error,
    setError,
    command,
    remoteStreams,
    speaking,
    microphoneActive,
    toggleMicrophone,
    leave,
    effectsEnabled,
    toggleEffects,
    subduedEffects,
    announcement: effectsEnabled ? announcement : null,
    turnConfigured,
  };
}
