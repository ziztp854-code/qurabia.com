'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  FastestButtonError,
  FastestButtonIdentity,
  FastestButtonSettings,
  FastestButtonSnapshot,
} from '@tahaddi/contracts';
import { resolveRealtimeNamespaceUrl } from '@/components/special-games/realtime-url';
export type FastestRole = 'host' | 'player' | 'display';
export function useFastestButton(
  role: FastestRole,
  initialCode?: string,
  hostToken?: string,
  hostId?: string,
) {
  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<FastestButtonSnapshot | null>(null);
  const identityRef = useRef<FastestButtonIdentity | null>(null);
  const restorePlayer = useRef(true);
  const [room, setRoom] = useState<FastestButtonSnapshot | null>(null);
  const [identity, setIdentity] = useState<FastestButtonIdentity | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    setPending(false);
  }, []);
  useEffect(() => {
    function readSession<T>(key: string): T | null {
      try {
        return JSON.parse(sessionStorage.getItem(key) ?? 'null') as T | null;
      } catch {
        return null;
      }
    }
    const url = resolveRealtimeNamespaceUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.origin,
      '/fastest-button',
    );
    const socket = io(url, {
      auth: hostToken ? { hostToken } : {},
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;
    const hostKey = `fastest:host:${hostId ?? ''}`;
    socket.on('connect', () => {
      setConnected(true);
      setError('');
      if (role === 'host') {
        const code = roomRef.current?.code ?? readSession<string>(hostKey);
        if (code && /^\d{6}$/.test(code)) socket.emit('fastest:host', { code });
      } else if (role === 'display') {
        if (initialCode) socket.emit('fastest:watch', { code: initialCode });
      } else {
        const code =
          roomRef.current?.code ??
          (restorePlayer.current
            ? (initialCode ?? readSession<string>('fastest:last-player-room'))
            : undefined);
        const saved =
          identityRef.current ??
          (code ? readSession<FastestButtonIdentity>(`fastest:player:${code}`) : null);
        if (saved?.token && saved.code === code) {
          identityRef.current = saved;
          setIdentity(saved);
          socket.emit('fastest:resume', { code: saved.code, token: saved.token });
        }
      }
    });
    socket.on('disconnect', () => {
      setConnected(false);
      clearPending();
    });
    socket.on('connect_error', () => {
      setConnected(false);
      setError('تعذّر الاتصال. نحاول إعادة الاتصال تلقائيًا؛ لا تُحتسب ضغطات أثناء الانقطاع.');
      clearPending();
    });
    socket.on('fastest:state', (next: FastestButtonSnapshot) => {
      if (roomRef.current?.code === next.code && next.revision < roomRef.current.revision) return;
      roomRef.current = next;
      setRoom(next);
      setClockOffset(next.serverNow - Date.now());
      clearPending();
      if (role === 'host') {
        try {
          sessionStorage.setItem(hostKey, JSON.stringify(next.code));
        } catch {
          /* current socket remains usable */
        }
      }
    });
    socket.on('fastest:identity', (next: FastestButtonIdentity) => {
      restorePlayer.current = true;
      identityRef.current = next;
      setIdentity(next);
      try {
        sessionStorage.setItem(`fastest:player:${next.code}`, JSON.stringify(next));
        sessionStorage.setItem('fastest:last-player-room', JSON.stringify(next.code));
      } catch {
        setError('التخزين غير متاح؛ حافظ على هذه الصفحة مفتوحة لاستمرار جلسة اللاعب.');
      }
    });
    socket.on('fastest:error', (next: FastestButtonError) => {
      setError(next.message);
      clearPending();
      if (['INVALID_SESSION', 'ROOM_NOT_FOUND'].includes(next.code)) {
        if (identityRef.current) {
          try {
            sessionStorage.removeItem(`fastest:player:${identityRef.current.code}`);
            sessionStorage.removeItem('fastest:last-player-room');
          } catch {}
        }
        identityRef.current = null;
        setIdentity(null);
        roomRef.current = null;
        setRoom(null);
        if (role === 'host') {
          try {
            sessionStorage.removeItem(hostKey);
          } catch {}
        }
      }
    });
    const offline = () => {
      socket.disconnect();
      setConnected(false);
      clearPending();
      setError(
        'انقطع اتصال الشبكة. لا تُحتسب ضغطات أثناء الانقطاع؛ سنستعيد حالتك عند عودة الاتصال.',
      );
    };
    const online = () => {
      socket.connect();
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    if (!navigator.onLine) socket.disconnect();
    const heartbeat = setInterval(() => {
      if (socket.connected && roomRef.current) socket.emit('fastest:sync');
    }, 10_000);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      if (timeout.current) clearTimeout(timeout.current);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, initialCode, hostToken, hostId, clearPending]);
  const emit = useCallback((event: string, payload: unknown) => {
    if (!socketRef.current?.connected) {
      setError('انتظر استعادة الاتصال بالخادم.');
      return;
    }
    setError('');
    setPending(true);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      setPending(false);
      setError('لم يصل تأكيد الخادم بعد. تُستعاد الحالة تلقائيًا؛ لا توجد نتيجة محلية.');
      socketRef.current?.emit('fastest:sync');
    }, 12_000);
    socketRef.current.emit(event, payload);
  }, []);
  return {
    room,
    identity,
    connected,
    error,
    pending,
    clockOffset,
    setError,
    create: (settings: FastestButtonSettings) => emit('fastest:create', settings),
    join: (code: string, name: string) => {
      let saved: FastestButtonIdentity | null = null;
      try {
        saved = JSON.parse(
          sessionStorage.getItem(`fastest:player:${code}`) ?? 'null',
        ) as FastestButtonIdentity | null;
      } catch {}
      if (saved?.token && saved.code === code) emit('fastest:resume', { code, token: saved.token });
      else emit('fastest:join', { code, name });
    },
    leave: () => {
      try {
        sessionStorage.removeItem('fastest:last-player-room');
      } catch {}
      restorePlayer.current = false;
      roomRef.current = null;
      identityRef.current = null;
      setRoom(null);
      setIdentity(null);
      setError('');
      clearPending();
      socketRef.current?.disconnect().connect();
    },
    command: (
      action: 'start' | 'stop' | 'reset' | 'configure' | 'remove',
      settings?: FastestButtonSettings,
      playerId?: string,
    ) =>
      room &&
      emit('fastest:command', {
        code: room.code,
        action,
        ...(settings ? { settings } : {}),
        ...(playerId ? { playerId } : {}),
      }),
    press: () => room?.round && emit('fastest:press', { code: room.code, roundId: room.round.id }),
  };
}
