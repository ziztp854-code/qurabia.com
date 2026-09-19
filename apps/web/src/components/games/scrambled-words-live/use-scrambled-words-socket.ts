'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { resolveRealtimeNamespaceUrl } from '../../special-games/realtime-url';
import type {
  ScrambledWordsGameEndedPayload,
  ScrambledWordsRoundEndedPayload,
  ScrambledWordsRoomSnapshot,
  ScrambledWordsWordAcceptedPayload,
} from '@tahaddi/contracts';

const SW_ACTION_TIMEOUT_MS = 12_000;

type ServerEvents = {
  'scrambled:room:state': (payload: ScrambledWordsRoomSnapshot) => void;
  'scrambled:error': (payload: { code: string; message: string }) => void;
  'scrambled:countdown': (payload: { remaining: number }) => void;
  'scrambled:word:accepted': (payload: ScrambledWordsWordAcceptedPayload) => void;
  'scrambled:word:rejected': (payload: {
    submissionId: string;
    code: string;
    message: string;
  }) => void;
  'scrambled:round:ended': (payload: ScrambledWordsRoundEndedPayload) => void;
  'scrambled:game:ended': (payload: ScrambledWordsGameEndedPayload) => void;
};

type ClientEvents = {
  'scrambled:host': (payload: {
    totalRounds?: number;
    roundTimeLimit?: number;
    firstFinish?: boolean;
  }) => void;
  'scrambled:join': (payload: { roomCode?: string; playerName?: string }) => void;
  'scrambled:start': (payload: { roomCode?: string }) => void;
  'scrambled:word:submit': (payload: {
    roomCode?: string;
    puzzleId?: string;
    word?: string;
    submissionId?: string;
  }) => void;
  'scrambled:next': (payload: { roomCode?: string }) => void;
  'scrambled:round:end': (payload: { roomCode?: string }) => void;
  'scrambled:game:finish': (payload: { roomCode?: string }) => void;
  'scrambled:leave': (payload: { roomCode?: string }) => void;
  'scrambled:reconnect': (payload: { roomCode?: string }) => void;
  'scrambled:sync': (payload: { roomCode?: string }) => void;
};

export type ScrambledWordsSocket = Socket<ServerEvents, ClientEvents>;

export type ScrambledWordsHostSocketIdentity = {
  hostId: string;
  accessToken: string;
};

export function resolveScrambledWordsRealtimeUrl(
  configuredUrl: string | undefined,
  currentOrigin: string,
) {
  return resolveRealtimeNamespaceUrl(
    configuredUrl,
    currentOrigin,
    '/scrambled-words',
  );
}

export interface ScrambledWordsSocketState {
  connected: boolean;
  connectionFailed: boolean;
  socketId: string;
  room: ScrambledWordsRoomSnapshot | null;
  error: string;
  errorCode: string;
  busy: boolean;
  gameEnd: ScrambledWordsGameEndedPayload | null;
  countdown: { remaining: number } | null;
  setError: (msg: string) => void;
  setBusy: (v: boolean) => void;
  socketRef: React.RefObject<ScrambledWordsSocket | null>;
  clearRoom: () => void;
  guestIdentityInvalid: boolean;
  wordRejectedTick: number;
}

export function useScrambledWordsSocket(
  guestId?: string,
  guestToken?: string,
  hostIdentity?: ScrambledWordsHostSocketIdentity,
): ScrambledWordsSocketState {
  const hostId = hostIdentity?.hostId;
  const hostAccessToken = hostIdentity?.accessToken;
  const socketRef = useRef<ScrambledWordsSocket | null>(null);
  const roomRef = useRef<ScrambledWordsRoomSnapshot | null>(null);
  const hasConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [room, setRoom] = useState<ScrambledWordsRoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [gameEnd, setGameEnd] = useState<ScrambledWordsGameEndedPayload | null>(
    null,
  );
  const [countdown, setCountdown] = useState<{ remaining: number } | null>(null);
  const [guestIdentityInvalid, setGuestIdentityInvalid] = useState(false);
  const [wordRejectedTick, setWordRejectedTick] = useState(0);

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
    const realtimeUrl = resolveScrambledWordsRealtimeUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost:3000',
    );
    const socket: ScrambledWordsSocket = io(realtimeUrl, {
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
        socket.emit('scrambled:reconnect', { roomCode: activeRoom.roomCode });
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
    socket.on('scrambled:error', ({ code, message }) => {
      setBusy(false);
      setErrorCode(code);
      if (code === 'ROOM_NOT_FOUND') {
        roomRef.current = null;
        setRoom(null);
        setError('الغرفة غير موجودة أو انتهت.');
        return;
      }
      if (code === 'INVALID_GUEST') {
        setGuestIdentityInvalid(true);
        setError('هوية الضيف غير صالحة أو منتهية. اضغط "تجديد الهوية" للمتابعة.');
        return;
      }
      setError(message);
    });
    socket.on('scrambled:room:state', (payload) => {
      setBusy(false);
      setErrorCode('');
      setGuestIdentityInvalid(false);
      roomRef.current = payload;
      setRoom(payload);
    });
    socket.on('scrambled:word:accepted', () => {
      setBusy(false);
    });
    socket.on('scrambled:word:rejected', () => {
      setBusy(false);
      setWordRejectedTick((tick) => tick + 1);
    });
    socket.on('scrambled:round:ended', () => {
      setBusy(false);
    });
    socket.on('scrambled:game:ended', (payload) => {
      setBusy(false);
      setGameEnd(payload);
    });
    socket.on('scrambled:countdown', (payload) => {
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
      socketRef.current?.emit('scrambled:sync', { roomCode: room.roomCode });
    }, 1_500);

    return () => window.clearInterval(interval);
  }, [connected, room?.roomCode]);

  useEffect(() => {
    if (!busy) return undefined;

    const timeout = window.setTimeout(() => {
      setBusy(false);
      setError('لم يصل رد الغرفة. تحقق من الاتصال ثم حاول مرة أخرى.');
    }, SW_ACTION_TIMEOUT_MS);

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
    wordRejectedTick,
  };
}
