'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { resolveRealtimeNamespaceUrl } from '../../special-games/realtime-url';
import type {
  EliminationAnswerAcceptedPayload,
  EliminationGameEndedPayload,
  EliminationRoundEndedPayload,
  EliminationRoomSnapshot,
} from '@tahaddi/contracts';

const EL_ACTION_TIMEOUT_MS = 12_000;

type ServerEvents = {
  'elimination:room:state': (payload: EliminationRoomSnapshot) => void;
  'elimination:error': (payload: { code: string; message: string }) => void;
  'elimination:countdown': (payload: { remaining: number }) => void;
  'elimination:answer:accepted': (
    payload: EliminationAnswerAcceptedPayload,
  ) => void;
  'elimination:answer:rejected': (payload: {
    submissionId: string;
    code: string;
    message: string;
  }) => void;
  'elimination:round:ended': (payload: EliminationRoundEndedPayload) => void;
  'elimination:game:ended': (payload: EliminationGameEndedPayload) => void;
};

type ClientEvents = {
  'elimination:host': (payload: {
    totalRounds?: number;
    roundTimeLimit?: number;
  }) => void;
  'elimination:join': (payload: {
    roomCode?: string;
    playerName?: string;
  }) => void;
  'elimination:start': (payload: { roomCode?: string }) => void;
  'elimination:answer:submit': (payload: {
    roomCode?: string;
    questionId?: string;
    optionIndex?: number;
    submissionId?: string;
  }) => void;
  'elimination:next': (payload: { roomCode?: string }) => void;
  'elimination:round:end': (payload: { roomCode?: string }) => void;
  'elimination:game:finish': (payload: { roomCode?: string }) => void;
  'elimination:leave': (payload: { roomCode?: string }) => void;
  'elimination:reconnect': (payload: { roomCode?: string }) => void;
  'elimination:sync': (payload: { roomCode?: string }) => void;
};

export type EliminationSocket = Socket<ServerEvents, ClientEvents>;

export type EliminationHostSocketIdentity = {
  hostId: string;
  accessToken: string;
};

export function resolveEliminationRealtimeUrl(
  configuredUrl: string | undefined,
  currentOrigin: string,
) {
  return resolveRealtimeNamespaceUrl(
    configuredUrl,
    currentOrigin,
    '/elimination',
  );
}

export interface EliminationSocketState {
  connected: boolean;
  connectionFailed: boolean;
  socketId: string;
  room: EliminationRoomSnapshot | null;
  error: string;
  errorCode: string;
  busy: boolean;
  gameEnd: EliminationGameEndedPayload | null;
  countdown: { remaining: number } | null;
  setError: (msg: string) => void;
  setBusy: (v: boolean) => void;
  socketRef: React.RefObject<EliminationSocket | null>;
  clearRoom: () => void;
  guestIdentityInvalid: boolean;
  answerRejectedTick: number;
}

export function useEliminationSocket(
  guestId?: string,
  guestToken?: string,
  hostIdentity?: EliminationHostSocketIdentity,
): EliminationSocketState {
  const hostId = hostIdentity?.hostId;
  const hostAccessToken = hostIdentity?.accessToken;
  const socketRef = useRef<EliminationSocket | null>(null);
  const roomRef = useRef<EliminationRoomSnapshot | null>(null);
  const hasConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [room, setRoom] = useState<EliminationRoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [gameEnd, setGameEnd] = useState<EliminationGameEndedPayload | null>(
    null,
  );
  const [countdown, setCountdown] = useState<{ remaining: number } | null>(null);
  const [guestIdentityInvalid, setGuestIdentityInvalid] = useState(false);
  const [answerRejectedTick, setAnswerRejectedTick] = useState(0);

  const clearRoom = useCallback(() => {
    roomRef.current = null;
    setRoom(null);
    setBusy(false);
    setError('');
    setErrorCode('');
    setGameEnd(null);
    setCountdown(null);
  }, []);

  useEffect(() => {
    const realtimeUrl = resolveEliminationRealtimeUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000',
    );
    const socket: EliminationSocket = io(realtimeUrl, {
      auth:
        hostId && hostAccessToken
          ? { hostId, hostAccessToken }
          : guestId && guestToken
            ? { guestId, guestToken }
            : undefined,
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const activeRoom = roomRef.current;
      setConnected(true);
      setConnectionFailed(false);
      setSocketId(socket.id ?? '');
      setError('');
      setErrorCode('');
      if (hasConnectedRef.current && activeRoom?.roomCode) {
        socket.emit('elimination:reconnect', { roomCode: activeRoom.roomCode });
      }
      hasConnectedRef.current = true;
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setSocketId('');
      setBusy(false);
      setError('انقطع الاتصال بخدمة اللعب المباشر. حاول مجددًا بعد عودة الاتصال.');
    });
    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionFailed(true);
      setBusy(false);
      setError(
        'تعذّر الاتصال بخدمة اللعب المباشر. تحقق من اتصالك ثم أعد تحميل الصفحة.',
      );
    });
    socket.on('elimination:error', ({ code, message }) => {
      setBusy(false);
      setErrorCode(code);
      if (code === 'ROOM_NOT_FOUND') {
        roomRef.current = null;
        setRoom(null);
        setError('الحلقة غير موجودة أو انتهت.');
        return;
      }
      if (code === 'INVALID_GUEST') {
        setGuestIdentityInvalid(true);
        setError('هوية الضيف غير صالحة أو منتهية. اضغط "تجديد الهوية" للمتابعة.');
        return;
      }
      setError(message);
    });
    socket.on('elimination:room:state', (payload) => {
      setBusy(false);
      setErrorCode('');
      setGuestIdentityInvalid(false);
      roomRef.current = payload;
      setRoom(payload);
    });
    socket.on('elimination:answer:accepted', () => {
      setBusy(false);
    });
    socket.on('elimination:answer:rejected', () => {
      setBusy(false);
      setAnswerRejectedTick((tick) => tick + 1);
    });
    socket.on('elimination:round:ended', () => {
      setBusy(false);
    });
    socket.on('elimination:game:ended', (payload) => {
      setBusy(false);
      setGameEnd(payload);
    });
    socket.on('elimination:countdown', (payload) => {
      setCountdown(payload);
      window.setTimeout(() => setCountdown(null), 2_600);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [guestId, guestToken, hostAccessToken, hostId]);

  useEffect(() => {
    if (!connected || !room?.roomCode) return undefined;

    const interval = window.setInterval(() => {
      socketRef.current?.emit('elimination:sync', { roomCode: room.roomCode });
    }, 1_500);

    return () => window.clearInterval(interval);
  }, [connected, room?.roomCode]);

  useEffect(() => {
    if (!busy) return undefined;

    const timeout = window.setTimeout(() => {
      setBusy(false);
      setError('لم يصل رد الحلقة. تحقق من الاتصال ثم حاول مرة أخرى.');
    }, EL_ACTION_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [busy]);

  return {
    connected,
    connectionFailed,
    socketId,
    room,
    error,
    errorCode,
    busy,
    gameEnd,
    countdown,
    setError,
    setBusy,
    socketRef,
    clearRoom,
    guestIdentityInvalid,
    answerRejectedTick,
  };
}
