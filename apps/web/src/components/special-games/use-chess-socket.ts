'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { ChessColor } from '@tahaddi/domain';
import { resolveRealtimeNamespaceUrl } from './realtime-url';
import { clearSavedChessRoom, saveChessRoomPin } from './chess-session-storage';

const CHESS_ACTION_TIMEOUT_MS = 12_000;

export type ChessRole = 'white' | 'black' | 'spectator';

export type ChessRoomSnapshot = {
  pin: string;
  phase: 'waiting' | 'ready' | 'countdown' | 'playing' | 'finished';
  fen: string;
  turn: 'white' | 'black';
  stateVersion: number;
  moves: Array<{
    san: string;
    from: string;
    to: string;
    promotion?: string;
    fen: string;
    timestamp: number;
    by: 'white' | 'black';
  }>;
  timeControl: { initialSeconds: number; incrementSeconds: number };
  whiteClock: { remainingMs: number; startedAt?: number };
  blackClock: { remainingMs: number; startedAt?: number };
  serverNow?: number;
  receivedAt?: number;
  seats: {
    white: { name: string; connected: boolean } | null;
    black: { name: string; connected: boolean } | null;
  };
  spectatorCount: number;
  lastMove: { from: string; to: string; san: string } | null;
  result: {
    reason: string;
    winner: 'white' | 'black' | 'draw' | null;
    endedAt: number;
  } | null;
  drawOffer: { by: 'white' | 'black'; at: number } | null;
  isHost: boolean;
  yourColor: ChessColor | null;
  yourRole: ChessRole;
  yourGuestId?: string;
};

export type GameEndPayload = {
  reason: string;
  winner: 'white' | 'black' | 'draw';
  durationMs: number;
  moveCount: number;
};

type ServerEvents = {
  'chess:room:state': (payload: ChessRoomSnapshot) => void;
  'chess:error': (payload: { code: string; message: string }) => void;
  'chess:move:ack': (payload: {
    san: string;
    from: string;
    to: string;
    promotion?: string;
    newFen: string;
    newStateVersion: number;
    isCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    isDraw: boolean;
    legalSquares?: string[];
    gameEnd?: { reason: string; winner: 'white' | 'black' | 'draw' };
  }) => void;
  'chess:move:rejected': (payload: {
    code: string;
    message: string;
    currentStateVersion: number;
    latestFen: string;
  }) => void;
  'chess:opponent:disconnect': (payload: { gracePeriodSeconds: number }) => void;
  'chess:opponent:reconnect': () => void;
  'chess:game:end': (payload: GameEndPayload) => void;
  'chess:draw:offered': (payload: { by: 'white' | 'black'; at: number }) => void;
  'chess:draw:result': (payload: { accepted: boolean }) => void;
  'chess:countdown': (payload: { remaining: number }) => void;
};

type ClientEvents = {
  'chess:room:create': (payload: {
    playerName?: string;
    timeControl?: string;
    colorChoice?: string;
  }) => void;
  'chess:room:join': (payload: { pin?: string; playerName?: string }) => void;
  'chess:spectate': (payload: { pin?: string; spectatorName?: string }) => void;
  'chess:player:ready': (payload: { pin?: string }) => void;
  'chess:move': (payload: {
    pin?: string;
    from?: string;
    to?: string;
    promotion?: string;
    expectedVersion?: number;
  }) => void;
  'chess:resign': (payload: { pin?: string }) => void;
  'chess:draw:offer': (payload: { pin?: string }) => void;
  'chess:draw:respond': (payload: { pin?: string; accept?: boolean }) => void;
  'chess:leave': (payload: { pin?: string }) => void;
  'chess:reconnect': (payload: { pin?: string; guestId?: string }) => void;
  'chess:sync': (payload: { pin?: string }) => void;
};

export type ChessSocket = Socket<ServerEvents, ClientEvents>;

export function resolveChessRealtimeUrl(configuredUrl: string | undefined, currentOrigin: string) {
  return resolveRealtimeNamespaceUrl(configuredUrl, currentOrigin, '/special-games');
}

export interface ChessSocketState {
  connected: boolean;
  connectionFailed: boolean;
  socketId: string;
  room: ChessRoomSnapshot | null;
  error: string;
  errorCode: string;
  busy: boolean;
  moveAck: {
    san: string;
    from: string;
    to: string;
    newFen: string;
    newStateVersion: number;
    isCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    isDraw: boolean;
    legalSquares?: string[];
    gameEnd?: { reason: string; winner: 'white' | 'black' | 'draw' };
  } | null;
  moveRejected: {
    code: string;
    message: string;
    currentStateVersion: number;
    latestFen: string;
  } | null;
  opponentDisconnect: { gracePeriodSeconds: number } | null;
  opponentReconnect: boolean;
  gameEnd: GameEndPayload | null;
  drawOffered: { by: 'white' | 'black'; at: number } | null;
  drawResult: { accepted: boolean } | null;
  countdown: { remaining: number } | null;
  setError: (msg: string) => void;
  setBusy: (v: boolean) => void;
  socketRef: React.RefObject<ChessSocket | null>;
  resetRoundState: () => void;
  clearRoom: () => void;
}

export function useChessSocket(guestId?: string, guestToken?: string): ChessSocketState {
  const socketRef = useRef<ChessSocket | null>(null);
  const roomRef = useRef<ChessRoomSnapshot | null>(null);
  const hasConnectedRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [room, setRoom] = useState<ChessRoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [moveAck, setMoveAck] = useState<ChessSocketState['moveAck']>(null);
  const [moveRejected, setMoveRejected] = useState<ChessSocketState['moveRejected']>(null);
  const [opponentDisconnect, setOpponentDisconnect] =
    useState<ChessSocketState['opponentDisconnect']>(null);
  const [opponentReconnect, setOpponentReconnect] = useState(false);
  const [gameEnd, setGameEnd] = useState<GameEndPayload | null>(null);
  const [drawOffered, setDrawOffered] = useState<ChessSocketState['drawOffered']>(null);
  const [drawResult, setDrawResult] = useState<ChessSocketState['drawResult']>(null);
  const [countdown, setCountdown] = useState<ChessSocketState['countdown']>(null);

  const resetRoundState = useCallback(() => {
    setError('');
    setErrorCode('');
    setMoveAck(null);
    setMoveRejected(null);
    setOpponentDisconnect(null);
    setOpponentReconnect(false);
    setGameEnd(null);
    setDrawOffered(null);
    setDrawResult(null);
    setCountdown(null);
  }, []);

  const clearRoom = useCallback(() => {
    roomRef.current = null;
    setRoom(null);
    setBusy(false);
    resetRoundState();
  }, [resetRoundState]);

  useEffect(() => {
    if (!guestId || !guestToken) return undefined;

    const realtimeUrl = resolveChessRealtimeUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    );
    const socket: ChessSocket = io(realtimeUrl, {
      auth: { guestId, guestToken },
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 20_000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      const activeRoom = roomRef.current;
      setConnected(true);
      setConnectionFailed(false);
      setSocketId(socket.id ?? '');
      setError('');
      setErrorCode('');
      if (hasConnectedRef.current && activeRoom?.pin) {
        if (activeRoom.yourRole === 'spectator') {
          socket.emit('chess:spectate', { pin: activeRoom.pin });
        } else {
          socket.emit('chess:reconnect', { pin: activeRoom.pin, guestId });
        }
      }
      hasConnectedRef.current = true;
    });
    socket.on('disconnect', (reason) => {
      setConnected(false);
      setSocketId('');
      setBusy(false);
      if (reason === 'io client disconnect') return;
      setError('انقطع الاتصال بخدمة اللعب المباشر. حاول مجددًا بعد عودة الاتصال.');
    });
    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionFailed(true);
      setBusy(false);
      setError('تعذّر الاتصال بخدمة اللعب المباشر. تحقق من اتصالك ثم أعد تحميل الصفحة.');
    });
    socket.on('chess:error', ({ code, message }) => {
      setBusy(false);
      setErrorCode(code);
      if (code === 'ROOM_NOT_FOUND') {
        clearSavedChessRoom();
        roomRef.current = null;
        setRoom(null);
        setError('الغرفة غير موجودة أو انتهت. أنشئ تحديًا جديدًا أو أدخل رمزًا صحيحًا.');
        return;
      }
      setError(message);
    });
    socket.on('chess:room:state', (payload) => {
      setBusy(false);
      setErrorCode('');
      const nextRoom = { ...payload, receivedAt: Date.now() };
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      saveChessRoomPin(payload.pin);
    });
    socket.on('chess:move:ack', (payload) => {
      setBusy(false);
      setMoveAck(payload);
    });
    socket.on('chess:move:rejected', (payload) => {
      setBusy(false);
      setMoveRejected(payload);
    });
    socket.on('chess:opponent:disconnect', (payload) => {
      setOpponentReconnect(false);
      setOpponentDisconnect(payload);
    });
    socket.on('chess:opponent:reconnect', () => {
      setOpponentReconnect(true);
      setOpponentDisconnect(null);
    });
    socket.on('chess:game:end', (payload) => {
      setBusy(false);
      setGameEnd(payload);
    });
    socket.on('chess:draw:offered', (payload) => {
      setDrawOffered(payload);
    });
    socket.on('chess:draw:result', (payload) => {
      setDrawResult(payload);
      setDrawOffered(null);
    });
    socket.on('chess:countdown', (payload) => {
      setCountdown(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [guestId, guestToken, resetRoundState]);

  useEffect(() => {
    if (!connected || !room?.pin) return undefined;

    const interval = window.setInterval(() => {
      socketRef.current?.emit('chess:sync', { pin: room.pin });
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [connected, room?.pin]);

  useEffect(() => {
    if (!busy) return undefined;

    const timeout = window.setTimeout(() => {
      setBusy(false);
      setError('لم يصل رد الغرفة. تحقق من الاتصال ثم حاول مرة أخرى.');
    }, CHESS_ACTION_TIMEOUT_MS);

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
    moveAck,
    moveRejected,
    opponentDisconnect,
    opponentReconnect,
    gameEnd,
    drawOffered,
    drawResult,
    countdown,
    setError,
    setBusy,
    socketRef,
    resetRoundState,
    clearRoom,
  };
}
