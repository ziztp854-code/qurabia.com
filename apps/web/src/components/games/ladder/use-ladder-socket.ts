'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { resolveRealtimeNamespaceUrl } from '../../special-games/realtime-url';
import type { LadderQuestion, LadderRoomSnapshot } from '@tahaddi/domain';

const LADDER_ACTION_TIMEOUT_MS = 12_000;

type ServerEvents = {
  'ladder:room:state': (payload: LadderRoomSnapshot) => void;
  'ladder:error': (payload: { code: string; message: string }) => void;
  'ladder:question:started': (payload: LadderQuestion) => void;
  'ladder:question:ended': (payload: { questionId: string }) => void;
  'ladder:round:result': (payload: {
    roundNumber: number;
    rightPosition: number;
    leftPosition: number;
    rightScore: number;
    leftScore: number;
    winner: 'right' | 'left' | null;
  }) => void;
  'ladder:game:end': (payload: {
    winner: 'right' | 'left' | 'draw' | null;
    rightScore: number;
    leftScore: number;
    durationMs: number;
  }) => void;
  'ladder:countdown': (payload: { remaining: number }) => void;
};

type ClientEvents = {
  'ladder:host': (payload: {
    totalRounds?: number;
    winningPosition?: number;
    questionTimeLimit?: number;
    quizId?: string;
  }) => void;
  'ladder:join': (payload: {
    roomCode?: string;
    playerName?: string;
    team?: 'right' | 'left';
  }) => void;
  'ladder:start': (payload: { roomCode?: string }) => void;
  'ladder:answer': (payload: { roomCode?: string; questionId?: string; optionId?: string }) => void;
  'ladder:leave': (payload: { roomCode?: string }) => void;
  'ladder:reconnect': (payload: { roomCode?: string }) => void;
  'ladder:sync': (payload: { roomCode?: string }) => void;
};

export type LadderSocket = Socket<ServerEvents, ClientEvents>;

export type LadderHostSocketIdentity = {
  hostId: string;
  accessToken: string;
};

export function resolveLadderRealtimeUrl(configuredUrl: string | undefined, currentOrigin: string) {
  return resolveRealtimeNamespaceUrl(configuredUrl, currentOrigin, '/ladder');
}

export interface LadderSocketState {
  connected: boolean;
  connectionFailed: boolean;
  socketId: string;
  room: LadderRoomSnapshot | null;
  error: string;
  errorCode: string;
  busy: boolean;
  gameEnd: {
    winner: 'right' | 'left' | 'draw' | null;
    rightScore: number;
    leftScore: number;
    durationMs: number;
  } | null;
  countdown: { remaining: number } | null;
  setError: (msg: string) => void;
  setErrorCode: (code: string) => void;
  setBusy: (v: boolean) => void;
  socketRef: React.RefObject<LadderSocket | null>;
  resetRoundState: () => void;
  clearRoom: () => void;
  /**
   * True when the server has rejected the current guest id/token with
   * INVALID_GUEST. The parent UI is expected to clear the persisted
   * identity, regenerate a fresh pair, and force the socket to reconnect.
   */
  guestIdentityInvalid: boolean;
}

export function useLadderSocket(
  guestId?: string,
  guestToken?: string,
  hostIdentity?: LadderHostSocketIdentity,
): LadderSocketState {
  const hostId = hostIdentity?.hostId;
  const hostAccessToken = hostIdentity?.accessToken;
  const socketRef = useRef<LadderSocket | null>(null);
  const roomRef = useRef<LadderRoomSnapshot | null>(null);
  const hasConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [room, setRoom] = useState<LadderRoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [gameEnd, setGameEnd] = useState<LadderSocketState['gameEnd']>(null);
  const [countdown, setCountdown] = useState<LadderSocketState['countdown']>(null);
  const [guestIdentityInvalid, setGuestIdentityInvalid] = useState(false);

  const resetRoundState = useCallback(() => {
    setError('');
    setErrorCode('');
    setGameEnd(null);
    setCountdown(null);
  }, []);

  const clearRoom = useCallback(() => {
    roomRef.current = null;
    setRoom(null);
    setBusy(false);
    resetRoundState();
  }, [resetRoundState]);

  useEffect(() => {
    const realtimeUrl = resolveLadderRealtimeUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    );
    const socket: LadderSocket = io(realtimeUrl, {
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
        socket.emit('ladder:reconnect', { roomCode: activeRoom.roomCode });
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
      setError('تعذّر الاتصال بخدمة اللعب المباشر. تحقق من اتصالك ثم أعد تحميل الصفحة.');
    });
    socket.on('ladder:error', ({ code, message }) => {
      setBusy(false);
      setErrorCode(code);
      if (code === 'ROOM_NOT_FOUND') {
        roomRef.current = null;
        setRoom(null);
        setError('الغرفة غير موجودة أو انتهت.');
        return;
      }
      if (code === 'INVALID_GUEST') {
        // Server rejected our identity (expired or tampered). Flag the
        // UI so the user can regenerate the identity without a hard reload.
        setGuestIdentityInvalid(true);
        setError('هوية الضيف غير صالحة أو منتهية. اضغط "تجديد الهوية" للمتابعة.');
        return;
      }
      if (code === 'INVALID_SESSION') {
        setError(message || 'انتهت جلستك. أعد الانضمام للغرفة.');
        return;
      }
      setError(message);
    });
    socket.on('ladder:room:state', (payload) => {
      setBusy(false);
      setErrorCode('');
      setGuestIdentityInvalid(false);
      roomRef.current = payload;
      setRoom(payload);
    });
    socket.on('ladder:question:started', () => {
      setBusy(false);
    });
    socket.on('ladder:question:ended', () => {
      setBusy(false);
    });
    socket.on('ladder:round:result', () => {
      setBusy(false);
    });
    socket.on('ladder:game:end', (payload) => {
      setBusy(false);
      setGameEnd(payload);
    });
    socket.on('ladder:countdown', (payload) => {
      setCountdown(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [guestId, guestToken, hostAccessToken, hostId, resetRoundState]);

  useEffect(() => {
    if (!connected || !room?.roomCode) return undefined;

    const interval = window.setInterval(() => {
      socketRef.current?.emit('ladder:sync', { roomCode: room.roomCode });
    }, 1_500);

    return () => window.clearInterval(interval);
  }, [connected, room?.roomCode]);

  useEffect(() => {
    if (!busy) return undefined;

    const timeout = window.setTimeout(() => {
      setBusy(false);
      setError('لم يصل رد الغرفة. تحقق من الاتصال ثم حاول مرة أخرى.');
    }, LADDER_ACTION_TIMEOUT_MS);

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
    setErrorCode,
    setBusy,
    socketRef,
    resetRoundState,
    clearRoom,
    guestIdentityInvalid,
  };
}
