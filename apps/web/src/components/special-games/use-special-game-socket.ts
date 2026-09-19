'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import type { SpecialGameMode } from '@tahaddi/domain';
import { resolveRealtimeNamespaceUrl } from './realtime-url';

/* ------------------------------------------------------------------ */
/* Types                                                                 */
/* ------------------------------------------------------------------ */

export type Player = { id: string; name: string; score: number };
export type Room = {
  pin: string;
  hostId: string;
  mode: SpecialGameMode;
  phase:
    | 'lobby'
    | 'parallel-answering'
    | 'parallel-reveal'
    | 'reverse-writing'
    | 'reverse-voting'
    | 'reverse-results'
    | 'infiltrator-answering'
    | 'infiltrator-voting'
    | 'infiltrator-reveal'
    | 'risk-turn'
    | 'finished';
  roundIndex: number;
  roundCount: number;
  players: Player[];
  readyPlayerIds: string[];
};
export type ParallelRound = {
  roundId: string;
  roundNumber: number;
  roundCount: number;
  face: string;
  faceLabel: string;
  prompt: string;
  options: string[];
  startsAt: number;
  timeLimit: number;
};
export type ParallelReveal = {
  answer: string;
  reveal: string;
  results: Array<{
    playerId: string;
    playerName: string;
    faceLabel: string;
    prompt: string;
    selectedAnswer: string | null;
    correct: boolean;
  }>;
};
export type ReverseRound = {
  roundId: string;
  roundNumber: number;
  roundCount: number;
  answer: string;
  category: string;
  hint: string;
  startsAt: number;
  timeLimit: number;
};
export type ReverseVoting = {
  answer: string;
  submissions: Array<{ id: string; text: string; isOwn: boolean }>;
};
export type ReverseResults = {
  answer: string;
  results: Array<{ id: string; playerName: string; text: string; votes: number }>;
};
export type InfiltratorRound = {
  roundId: string;
  roundNumber: number;
  roundCount: number;
  prompt: string;
  options: string[];
  isInfiltrator: boolean;
  startsAt: number;
  timeLimit: number;
};
export type InfiltratorVoting = {
  answers: Array<{ playerId: string; answer: string; isOwn: boolean }>;
  isInfiltrator: boolean;
  majorityOptions: string[];
};
export type InfiltratorReveal = {
  infiltratorId: string;
  infiltratorName: string;
  caught: boolean;
  survived: boolean;
  guessedMajority: boolean;
  infiltratorWon: boolean;
  majorityQuestion: string;
  answers: Array<{ playerId: string; playerName: string; answer: string }>;
  voteCounts: Record<string, number>;
};
export type GameEnd = {
  players: Player[];
  mode: SpecialGameMode;
  durationMs: number;
};
export type RiskState = {
  roundNumber: number;
  roundCount: number;
  activePlayerId: string;
  pot: number;
  shield: boolean;
  doubleNext: boolean;
  awaitingDecision: boolean;
  message: string;
  cards: Array<{
    id: string;
    revealed: boolean;
    kind?: 'points' | 'bomb' | 'double' | 'shield' | 'treasure';
    value?: number;
  }>;
};

type ServerEvents = {
  'special:room:state': (payload: Room) => void;
  'special:error': (payload: { code: string; message: string }) => void;
  'special:session': (payload: {
    pin: string;
    mode: SpecialGameMode;
    token: string;
  }) => void;
  'special:game:end': (payload: GameEnd) => void;
  'parallel:round': (payload: ParallelRound) => void;
  'parallel:answer:ack': (payload: {
    correct: boolean;
    earned: number;
    selectedAnswer: string;
  }) => void;
  'parallel:reveal': (payload: ParallelReveal) => void;
  'reverse:round': (payload: ReverseRound) => void;
  'reverse:question:ack': (payload: { question: string }) => void;
  'reverse:voting': (payload: ReverseVoting) => void;
  'reverse:vote:ack': (payload: { submissionId: string }) => void;
  'reverse:results': (payload: ReverseResults) => void;
  'infiltrator:round': (payload: InfiltratorRound) => void;
  'infiltrator:answer:ack': (payload: { selectedAnswer: string }) => void;
  'infiltrator:voting': (payload: InfiltratorVoting) => void;
  'infiltrator:vote:ack': (payload: { playerId: string }) => void;
  'infiltrator:majority:guess:ack': (payload: { question: string }) => void;
  'infiltrator:reveal': (payload: InfiltratorReveal) => void;
  'risk:state': (payload: RiskState) => void;
};
type ClientEvents = {
  'special:room:create': (payload: { mode: SpecialGameMode; contentToken?: string }) => void;
  'special:room:join': (payload: { pin: string; playerName: string }) => void;
  'special:room:leave': (payload: { pin: string }) => void;
  'special:player:ready': (payload: { pin: string }) => void;
  'special:game:start': (payload: { pin: string }) => void;
  'special:round:next': (payload: { pin: string }) => void;
  'parallel:answer:submit': (payload: { pin: string; roundId: string; answer: string }) => void;
  'parallel:reveal': (payload: { pin: string }) => void;
  'reverse:question:submit': (payload: { pin: string; roundId: string; question: string }) => void;
  'reverse:voting:start': (payload: { pin: string }) => void;
  'reverse:vote': (payload: { pin: string; submissionId: string }) => void;
  'reverse:reveal': (payload: { pin: string }) => void;
  'infiltrator:answer:submit': (payload: { pin: string; roundId: string; answer: string }) => void;
  'infiltrator:voting:start': (payload: { pin: string }) => void;
  'infiltrator:vote': (payload: { pin: string; playerId: string }) => void;
  'infiltrator:majority:guess': (payload: { pin: string; question: string }) => void;
  'infiltrator:reveal': (payload: { pin: string }) => void;
  'risk:card:select': (payload: { pin: string; cardId: string }) => void;
  'risk:continue': (payload: { pin: string }) => void;
  'risk:cashout': (payload: { pin: string }) => void;
  'risk:room:resume': (payload: { pin: string; token: string }) => void;
  'risk:turn:skip': (payload: { pin: string }) => void;
};
export type GameSocket = Socket<ServerEvents, ClientEvents>;

/* ------------------------------------------------------------------ */
/* URL resolver (exported for tests)                                    */
/* ------------------------------------------------------------------ */

export function resolveSpecialGamesRealtimeUrl(
  configuredUrl: string | undefined,
  currentOrigin: string,
) {
  return resolveRealtimeNamespaceUrl(configuredUrl, currentOrigin, '/special-games');
}

/* ------------------------------------------------------------------ */
/* Hook                                                                  */
/* ------------------------------------------------------------------ */

export interface SpecialGameSocketState {
  connected: boolean;
  connectionFailed: boolean;
  socketId: string;
  room: Room | null;
  error: string;
  busy: boolean;
  parallelRound: ParallelRound | null;
  parallelAck: { correct: boolean; earned: number; selectedAnswer: string } | null;
  parallelReveal: ParallelReveal | null;
  reverseRound: ReverseRound | null;
  reverseQuestion: string;
  submittedQuestion: string;
  voting: ReverseVoting | null;
  selectedVote: string;
  reverseResults: ReverseResults | null;
  infiltratorRound: InfiltratorRound | null;
  infiltratorAnswer: string;
  infiltratorVoting: InfiltratorVoting | null;
  infiltratorVote: string;
  infiltratorGuess: string;
  infiltratorReveal: InfiltratorReveal | null;
  gameEnd: GameEnd | null;
  riskState: RiskState | null;
  setError: (msg: string) => void;
  setBusy: (v: boolean) => void;
  setReverseQuestion: (v: string) => void;
  setInfiltratorAnswer: (v: string) => void;
  socketRef: React.RefObject<GameSocket | null>;
  resetRoundState: () => void;
}

export function useSpecialGameSocket(mode: SpecialGameMode): SpecialGameSocketState {
  const socketRef = useRef<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [socketId, setSocketId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [parallelRound, setParallelRound] = useState<ParallelRound | null>(null);
  const [parallelAck, setParallelAck] = useState<{
    correct: boolean;
    earned: number;
    selectedAnswer: string;
  } | null>(null);
  const [parallelReveal, setParallelReveal] = useState<ParallelReveal | null>(null);
  const [reverseRound, setReverseRound] = useState<ReverseRound | null>(null);
  const [reverseQuestion, setReverseQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [voting, setVoting] = useState<ReverseVoting | null>(null);
  const [selectedVote, setSelectedVote] = useState('');
  const [reverseResults, setReverseResults] = useState<ReverseResults | null>(null);
  const [infiltratorRound, setInfiltratorRound] = useState<InfiltratorRound | null>(null);
  const [infiltratorAnswer, setInfiltratorAnswer] = useState('');
  const [infiltratorVoting, setInfiltratorVoting] = useState<InfiltratorVoting | null>(null);
  const [infiltratorVote, setInfiltratorVote] = useState('');
  const [infiltratorGuess, setInfiltratorGuess] = useState('');
  const [infiltratorReveal, setInfiltratorReveal] = useState<InfiltratorReveal | null>(null);
  const [gameEnd, setGameEnd] = useState<GameEnd | null>(null);
  const [riskState, setRiskState] = useState<RiskState | null>(null);

  const resetRoundState = useCallback(() => {
    setError('');
    setParallelRound(null);
    setParallelAck(null);
    setParallelReveal(null);
    setReverseRound(null);
    setReverseQuestion('');
    setSubmittedQuestion('');
    setVoting(null);
    setSelectedVote('');
    setReverseResults(null);
    setInfiltratorRound(null);
    setInfiltratorAnswer('');
    setInfiltratorVoting(null);
    setInfiltratorVote('');
    setInfiltratorGuess('');
    setInfiltratorReveal(null);
    setRiskState(null);
  }, []);

  useEffect(() => {
    const realtimeUrl = resolveSpecialGamesRealtimeUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.origin,
    );
    const socket: GameSocket = io(realtimeUrl, {
      transports: ['websocket'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectionFailed(false);
      setSocketId(socket.id ?? '');
      setError('');
      try {
        const saved = localStorage.getItem(`tahaddi-special-session-${mode}`);
        const session = saved ? (JSON.parse(saved) as { pin?: string; token?: string }) : null;
        if (session?.pin && session.token) {
          socket.emit('risk:room:resume', { pin: session.pin, token: session.token });
        }
      } catch {
        // Storage may be unavailable in privacy mode; reconnect remains optional.
      }
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setSocketId('');
    });
    socket.on('connect_error', () => {
      setConnected(false);
      setConnectionFailed(true);
      setBusy(false);
      setError('تعذّر الاتصال بخدمة اللعب المباشر. تحقق من اتصالك ثم أعد تحميل الصفحة.');
    });
    socket.on('special:error', ({ code, message }) => {
      setBusy(false);
      setError(message);
      if (mode === 'risk' && (code === 'ROOM_NOT_FOUND' || code === 'INVALID_SESSION')) {
        localStorage.removeItem(`tahaddi-special-session-${mode}`);
      }
    });
    socket.on('special:room:state', (payload) => {
      setBusy(false);
      setRoom(payload);
    });
    socket.on('special:session', (payload) => {
      if (payload.mode !== mode) return;
      localStorage.setItem(
        `tahaddi-special-session-${mode}`,
        JSON.stringify({ pin: payload.pin, token: payload.token }),
      );
    });
    socket.on('parallel:round', (payload) => {
      resetRoundState();
      setParallelRound(payload);
    });
    socket.on('parallel:answer:ack', (payload) => {
      setBusy(false);
      setParallelAck(payload);
    });
    socket.on('parallel:reveal', (payload) => {
      setBusy(false);
      setParallelReveal(payload);
    });
    socket.on('reverse:round', (payload) => {
      resetRoundState();
      setReverseRound(payload);
    });
    socket.on('reverse:question:ack', ({ question }) => {
      setBusy(false);
      setSubmittedQuestion(question);
    });
    socket.on('reverse:voting', (payload) => {
      setBusy(false);
      setVoting(payload);
    });
    socket.on('reverse:vote:ack', ({ submissionId }) => {
      setBusy(false);
      setSelectedVote(submissionId);
    });
    socket.on('reverse:results', (payload) => {
      setBusy(false);
      setReverseResults(payload);
    });
    socket.on('infiltrator:round', (payload) => {
      resetRoundState();
      setInfiltratorRound(payload);
    });
    socket.on('infiltrator:answer:ack', ({ selectedAnswer }) => {
      setBusy(false);
      setInfiltratorAnswer(selectedAnswer);
    });
    socket.on('infiltrator:voting', (payload) => {
      setBusy(false);
      setInfiltratorVoting(payload);
    });
    socket.on('infiltrator:vote:ack', ({ playerId }) => {
      setBusy(false);
      setInfiltratorVote(playerId);
    });
    socket.on('infiltrator:majority:guess:ack', ({ question }) => {
      setBusy(false);
      setInfiltratorGuess(question);
    });
    socket.on('infiltrator:reveal', (payload) => {
      setBusy(false);
      setInfiltratorReveal(payload);
    });
    socket.on('risk:state', (payload) => {
      setBusy(false);
      setRiskState(payload);
    });
    socket.on('special:game:end', (payload) => {
      setBusy(false);
      setGameEnd(payload);
      if (payload.mode === 'risk') {
        localStorage.removeItem('tahaddi-special-session-risk');
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [mode, resetRoundState]);

  return {
    connected,
    connectionFailed,
    socketId,
    room,
    error,
    busy,
    parallelRound,
    parallelAck,
    parallelReveal,
    reverseRound,
    reverseQuestion,
    submittedQuestion,
    voting,
    selectedVote,
    reverseResults,
    infiltratorRound,
    infiltratorAnswer,
    infiltratorVoting,
    infiltratorVote,
    infiltratorGuess,
    infiltratorReveal,
    gameEnd,
    riskState,
    setError,
    setBusy,
    setReverseQuestion,
    setInfiltratorAnswer,
    socketRef,
    resetRoundState,
  };
}
