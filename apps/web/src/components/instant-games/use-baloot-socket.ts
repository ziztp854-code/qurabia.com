'use client';

import type { Contract, RoundScore } from '@tahaddi/domain';
import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveRealtimeNamespaceUrl } from '../special-games/realtime-url';

export type BalootSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type BalootRank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type BalootCard = { id: string; suit: BalootSuit; rank: BalootRank };
/**
 * Every possible auction action. Mirrors the server's `BalootBid` so the
 * socket layer can forward bids verbatim without losing information.
 */
export type BalootBid =
  | { mode: 'pass' }
  | { mode: 'sun' }
  | { mode: 'hokum'; trump: BalootSuit }
  | { mode: 'ashkal' }
  | { mode: 'accept' }
  | { mode: 'double'; play: 'open' | 'locked' }
  | { mode: 'triple' }
  | { mode: 'quadruple'; play: 'open' | 'locked' }
  | { mode: 'gahwa' };
/** Bare contract: mode + optional trump. The full engine state lives on the server. */
export type BalootContract = Contract;
/** Augmented contract: bare contract + multiplier, buyer seat, auction round. */
export type BalootContractState = {
  mode: BalootContract;
  multiplier: 1 | 2 | 3 | 4;
  buyerSeat: number;
  auctionRound: 1 | 2;
  declaredBySeat: number;
};
export type BalootSnapshot = {
  roomCode: string;
  phase:
    | 'LOBBY'
    | 'READY'
    | 'DEALING'
    | 'BIDDING'
    | 'DOUBLING'
    | 'PLAYING'
    | 'TRICK_RESULT'
    | 'ROUND_RESULT'
    | 'GAME_OVER';
  stateVersion: number;
  seats: Array<{
    seat: number;
    team: 'A' | 'B';
    playerName: string;
    ready: boolean;
    connected: boolean;
    isHost: boolean;
  }>;
  yourSeat: number;
  yourTeam: 'A' | 'B';
  yourHand: BalootCard[];
  contract: BalootContractState | null;
  /** Last contract offered in the auction (null before the first bid). */
  lastContract: BalootContractState | null;
  /** Seat that owns the contract. */
  buyerPlayerId: number;
  /** Seat that will lead the first trick. */
  leaderSeat: number;
  /** Current auction round (1 or 2). */
  auctionRound: 1 | 2;
  /** Seat that has the next auction / doubling action. */
  bidder: number;
  /** Pending double waiting for an answer, or null. */
  pendingDouble: {
    fromSeat: number;
    announcement: 'double' | 'triple' | 'quadruple';
  } | null;
  turn: number | null;
  currentTrick: Array<{ seat: number; card: BalootCard }>;
  trickHistory: Array<{
    winnerSeat: number;
    winnerTeam: 'A' | 'B';
    cards: Array<{ seat: number; card: BalootCard }>;
  }>;
  scores: [number, number];
  roundScore: RoundScore | null;
  autoPlayEvents: Array<{
    type: 'AUTO_PLAY';
    reason: 'TURN_TIMEOUT';
    seat: number;
    trickNumber: number;
    card: BalootCard;
  }>;
  /**
   * The bid options the local player is allowed to take in the current
   * state. The server is the only authority that produces this list; the
   * client renders exactly these buttons and nothing else.
   */
  availableBids: BalootBid[];
};

type Session = { roomCode: string; sessionToken: string; snapshot: BalootSnapshot };
type Ack = { ok: true; data: Session } | { ok: false; code: string; message: string };
type ServerEvents = { 'baloot:state': (snapshot: BalootSnapshot) => void };
type ClientEvents = {
  'baloot:host': (payload: { playerName: string }, ack: (result: Ack) => void) => void;
  'baloot:join': (
    payload: { roomCode: string; playerName: string; sessionToken?: string },
    ack: (result: Ack) => void,
  ) => void;
  'baloot:ready': (payload: { ready: boolean }, ack: (result: Ack) => void) => void;
  'baloot:start': (payload: Record<string, never>, ack: (result: Ack) => void) => void;
  'baloot:next-round': (payload: Record<string, never>, ack: (result: Ack) => void) => void;
  'baloot:leave': (payload: Record<string, never>, ack: (result: Ack | { ok: true; data: { left: true } }) => void) => void;
  'baloot:reconnect': (payload: { sessionToken: string }, ack: (result: Ack) => void) => void;
  'baloot:bid': (
    payload: {
      bid: BalootBid;
      expectedVersion: number;
      commandId: string;
    },
    ack: (result: Ack) => void,
  ) => void;
  'baloot:play-card': (
    payload: {
      card: Pick<BalootCard, 'suit' | 'rank'>;
      expectedVersion: number;
      commandId: string;
    },
    ack: (result: Ack) => void,
  ) => void;
};

type BalootSocket = Socket<ServerEvents, ClientEvents>;
type PendingCommand = {
  [E in keyof ClientEvents]: { event: E; payload: Parameters<ClientEvents[E]>[0] };
}[keyof ClientEvents];
type Send = <E extends keyof ClientEvents>(
  event: E,
  payload: Parameters<ClientEvents[E]>[0],
) => void;

const TOKEN_KEY = 'tahaddi-baloot-session-token';
const ROOM_KEY = 'tahaddi-baloot-room-code';
const COMMAND_ACK_TIMEOUT_MS = 7_000;
const QUEUEABLE_EVENTS = new Set<keyof ClientEvents>(['baloot:host', 'baloot:join']);
const CONNECT_ATTEMPTS_BEFORE_WARNING = 3;

export type BalootConnectionQuality = 'offline' | 'excellent' | 'good' | 'slow';

function getConnectionQuality(connected: boolean, latencyMs: number | null): BalootConnectionQuality {
  if (!connected) return 'offline';
  if (latencyMs === null || latencyMs < 150) return 'excellent';
  if (latencyMs < 450) return 'good';
  return 'slow';
}

function getSavedSessionToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function getSavedRoomCode() {
  return sessionStorage.getItem(ROOM_KEY);
}

function saveSession(sessionToken: string, roomCode: string) {
  sessionStorage.setItem(TOKEN_KEY, sessionToken);
  sessionStorage.setItem(ROOM_KEY, roomCode);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROOM_KEY);
}

function clearSavedSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ROOM_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROOM_KEY);
}

export function useBalootSocket() {
  const socketRef = useRef<BalootSocket | null>(null);
  const pendingRef = useRef<PendingCommand | null>(null);
  const sendRef = useRef<Send | null>(null);
  const connectAttemptsRef = useRef(0);
  // Synchronous guard so back-to-back calls in the same tick can't race the
  // React state update that disables the submit button.
  const busyRef = useRef(false);
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const [room, setRoom] = useState<BalootSnapshot | null>(null);
  const connectionQuality = getConnectionQuality(connected, latencyMs);

  // Overlapping broadcasts can arrive out of order, so never step backwards.
  const applySnapshot = useCallback((snapshot: BalootSnapshot) => {
    setRoom((current) =>
      current &&
      current.roomCode === snapshot.roomCode &&
      current.stateVersion > snapshot.stateVersion
        ? current
        : snapshot,
    );
  }, []);

  const accept = useCallback(
    (result: Ack) => {
      busyRef.current = false;
      setBusy(false);
      setRestoring(false);
      if (!result.ok) {
        if (result.code === 'INVALID_SESSION') clearSavedSession();
        setError(result.message);
        return;
      }
      setError('');
      applySnapshot(result.data.snapshot);
      saveSession(result.data.sessionToken, result.data.roomCode);
    },
    [applySnapshot],
  );

  useEffect(() => {
    const url = resolveRealtimeNamespaceUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.origin,
      '/baloot',
    );
    const socket: BalootSocket = io(url, {
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      setError('');
      connectAttemptsRef.current = 0;
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        sendRef.current?.(pending.event, pending.payload);
        return;
      }
      if (socket.recovered) {
        setRestoring(false);
        return;
      }
      const token = getSavedSessionToken();
      if (token) {
        setRestoring(true);
        socket.emit('baloot:reconnect', { sessionToken: token }, accept);
      }
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setLatencyMs(null);
      busyRef.current = false;
      setBusy(false);
      setError('انقطع الاتصال. سنعيد مقعدك تلقائياً عند عودة الشبكة.');
    });
    socket.on('connect_error', () => {
      setConnected(false);
      setLatencyMs(null);
      connectAttemptsRef.current += 1;
      // Socket.IO keeps retrying forever, so stay quiet through the first blips.
      if (connectAttemptsRef.current < CONNECT_ATTEMPTS_BEFORE_WARNING) return;
      setError('جارٍ الاتصال بخادم البلوت… سندخلك المجلس تلقائياً عند نجاح الاتصال.');
    });
    socket.on('baloot:state', applySnapshot);
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accept, applySnapshot]);

  const emit = useCallback(
    <E extends keyof ClientEvents>(event: E, payload: Parameters<ClientEvents[E]>[0]) => {
      // Synchronous dedupe: drop duplicate calls in the same tick so a rapid
      // double-click can't fire two socket emits before React disables the button.
      if (busyRef.current && event !== 'baloot:leave') return;
      const socket = socketRef.current;
      if (!socket?.connected) {
        if (!QUEUEABLE_EVENTS.has(event)) {
          setError('الاتصال غير جاهز بعد.');
          return;
        }
        busyRef.current = true;
        pendingRef.current = { event, payload } as PendingCommand;
        setBusy(true);
        setError('');
        socket?.connect();
        return;
      }
      if (event === 'baloot:join') {
        const savedRoom = getSavedRoomCode();
        const savedToken = getSavedSessionToken();
        const joiningCode =
          'roomCode' in payload ? String(payload.roomCode ?? '') : '';
        if (savedToken && savedRoom === joiningCode) {
          Object.assign(payload, { sessionToken: savedToken });
        }
      }
      busyRef.current = true;
      setBusy(true);
      setError('');
      const startedAt = performance.now();
      const timedSocket = socket.timeout(COMMAND_ACK_TIMEOUT_MS) as unknown as {
        emit: (
          eventName: E,
          eventPayload: Parameters<ClientEvents[E]>[0],
          callback: (timeoutError: Error | null, result?: Ack) => void,
        ) => void;
      };
      const emitWithAck = timedSocket.emit.bind(timedSocket) as (
        eventName: E,
        eventPayload: Parameters<ClientEvents[E]>[0],
        callback: (timeoutError: Error | null, result?: Ack) => void,
      ) => void;
      emitWithAck(event, payload, (timeoutError, result) => {
        setLatencyMs(Math.round(performance.now() - startedAt));
        if (timeoutError || !result) {
          busyRef.current = false;
          setBusy(false);
          setError('تأخر خادم اللعب في الرد. تحقق من الاتصال ثم حاول مجدداً.');
          return;
        }
        accept(result);
      });
    },
    [accept],
  );

  useEffect(() => {
    sendRef.current = emit;
  }, [emit]);

  const leave = useCallback(() => {
    const socket = socketRef.current;
    const finishLeave = () => {
      busyRef.current = false;
      pendingRef.current = null;
      clearSavedSession();
      setRoom(null);
      setError('');
      setBusy(false);
      setRestoring(false);
      if (socket) {
        socket.disconnect();
        window.setTimeout(() => socket.connect(), 0);
      }
    };
    if (socket?.connected) {
      socket.timeout(COMMAND_ACK_TIMEOUT_MS).emit('baloot:leave', {}, () => {
        finishLeave();
      });
      window.setTimeout(finishLeave, COMMAND_ACK_TIMEOUT_MS);
      return;
    }
    finishLeave();
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return { connected, latencyMs, connectionQuality, busy, restoring, error, room, emit, leave, clearError };
}
