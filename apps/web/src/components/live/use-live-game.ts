'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateClockOffset,
  type AnswerRejectionReason,
  type ClientToServerEvents,
  type GameSnapshot,
  type LiveRole,
  type QuestionStatsPayload,
  type ServerToClientEvents,
} from '@tahaddi/contracts';
import { io, type Socket } from 'socket.io-client';
import { getOrCreateDeviceId } from '@/lib/device-identity';
import { resolveRealtimeNamespaceUrl } from '../special-games/realtime-url';

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const rejectionMessages: Record<AnswerRejectionReason, string> = {
  INVALID_SESSION: 'الجلسة غير متاحة.',
  INVALID_PLAYER: 'تعذّر التحقق من اللاعب. افتح رابط الغرفة من جديد.',
  QUESTION_NOT_ACTIVE: 'السؤال غير مفتوح الآن.',
  QUESTION_MISMATCH: 'انتقلت الجلسة إلى سؤال آخر.',
  INVALID_OPTION: 'هذا الخيار غير صالح.',
  DUPLICATE_ANSWER: 'تم استلام إجابتك مسبقًا.',
  ANSWER_TOO_LATE: 'انتهى وقت الإجابة.',
};

export function useLiveGame(input: {
  sessionId: string;
  subjectId: string;
  accessToken: string;
  role: LiveRole;
}) {
  const { sessionId, subjectId, accessToken, role } = input;
  const socketRef = useRef<LiveSocket | null>(null);
  const bestRtt = useRef(Number.POSITIVE_INFINITY);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [stats, setStats] = useState<QuestionStatsPayload | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('جارٍ الاتصال بالغرفة…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    const realtimeUrl = resolveRealtimeNamespaceUrl(
      process.env.NEXT_PUBLIC_REALTIME_URL,
      window.location.origin,
      '/',
    );

    const socket: LiveSocket = io(realtimeUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
    });
    socketRef.current = socket;

    const join = () => {
      setConnected(true);
      setMessage('');
      bestRtt.current = Number.POSITIVE_INFINITY;
      socket.emit('game:join', { sessionId, subjectId, accessToken, role, deviceId });
      socket.emit('clock:ping', { clientSentAt: Date.now() });
    };
    const disconnected = () => {
      setConnected(false);
      setMessage('انقطع الاتصال؛ نحاول استعادة الجلسة…');
    };
    socket.on('connect', join);
    socket.on('disconnect', disconnected);
    socket.on('connect_error', () => {
      setConnected(false);
      setMessage('تعذّر الاتصال بخدمة اللعب المباشر؛ نحاول إعادة الاتصال…');
    });
    socket.on('clock:pong', (payload) => {
      const receivedAt = Date.now();
      const rtt = Math.max(0, receivedAt - payload.clientSentAt);
      if (rtt <= bestRtt.current) {
        bestRtt.current = rtt;
        setClockOffset(
          calculateClockOffset({
            clientSentAt: payload.clientSentAt,
            clientReceivedAt: receivedAt,
            serverTime: payload.serverTime,
          }),
        );
      }
    });
    socket.on('game:snapshot', (next) => {
      setSnapshot(next);
      setStats(next.reveal?.stats ?? null);
      setBusy(false);
      setMessage('');
    });
    socket.on('question:started', (question) => {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              phase: 'QUESTION',
              question,
              reveal: null,
              playerAnswer: null,
              playerResult: null,
            }
          : current,
      );
      setStats(null);
      setBusy(false);
      setMessage('');
    });
    socket.on('answer:accepted', ({ questionId, receivedAt }) => {
      setSnapshot((current) =>
        current?.question?.questionId === questionId
          ? {
              ...current,
              playerAnswer: {
                optionId: current.playerAnswer?.optionId ?? '',
                receivedAt,
              },
            }
          : current,
      );
      setBusy(false);
      setMessage('تم استلام إجابتك.');
    });
    socket.on('answer:rejected', ({ reason }) => {
      if (reason !== 'DUPLICATE_ANSWER') {
        setSnapshot((current) => (current ? { ...current, playerAnswer: null } : current));
      }
      setBusy(false);
      setMessage(rejectionMessages[reason]);
    });
    socket.on('question:stats', setStats);
    socket.on('question:revealed', (reveal) => {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              phase: 'REVEAL',
              reveal,
              playerResult: reveal.playerResult ?? null,
            }
          : current,
      );
      setStats(reveal.stats);
      setBusy(false);
    });
    socket.on('leaderboard:shown', ({ leaderboard }) => {
      setSnapshot((current) =>
        current ? { ...current, phase: 'LEADERBOARD', leaderboard } : current,
      );
      setBusy(false);
    });
    socket.on('game:finished', ({ leaderboard }) => {
      setSnapshot((current) =>
        current ? { ...current, phase: 'FINISHED', leaderboard } : current,
      );
      setBusy(false);
    });
    socket.on('game:player_joined', ({ player, participantCount }) => {
      setSnapshot((current) => {
        if (!current) return current;
        const existing = current.leaderboard.filter((item) => item.id !== player.id);
        return {
          ...current,
          participantCount,
          leaderboard: role === 'host' ? [...existing, player].sort((a, b) => a.rank - b.rank) : [],
        };
      });
    });
    socket.on('game:player_left', ({ playerId, participantCount }) => {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              participantCount,
              leaderboard:
                role === 'host' ? current.leaderboard.filter((item) => item.id !== playerId) : [],
            }
          : current,
      );
    });
    socket.on('game:error', ({ message: errorMessage }) => {
      setBusy(false);
      setMessage(errorMessage);
    });

    const clockTimer = window.setInterval(() => {
      if (socket.connected) socket.emit('clock:ping', { clientSentAt: Date.now() });
    }, 10_000);

    return () => {
      window.clearInterval(clockTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, role, sessionId, subjectId]);

  const command = useCallback(
    (event: 'question:start' | 'question:next' | 'question:skip' | 'game:finish') => {
      if (!connected || busy) return;
      setBusy(true);
      if (!socketRef.current?.connected) {
        setBusy(false);
        return;
      }
      socketRef.current.emit(event, { sessionId });
      window.setTimeout(() => setBusy(false), 3_000);
    },
    [busy, connected, sessionId],
  );

  const submitAnswer = useCallback(
    (questionId: string, optionId: string) => {
      if (!connected || busy || snapshot?.playerAnswer) return;
      setBusy(true);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              playerAnswer: { optionId, receivedAt: 0 },
            }
          : current,
      );
      if (!socketRef.current?.connected) {
        setBusy(false);
        return;
      }
      socketRef.current.emit('answer:submit', {
        sessionId,
        questionId,
        optionId,
      });
    },
    [busy, connected, sessionId, snapshot?.playerAnswer],
  );
  const revealQuestion = useCallback(
    (questionId: string) => {
      if (!connected || busy || !questionId || !socketRef.current?.connected) return;
      setBusy(true);
      socketRef.current.emit('question:reveal', { sessionId, questionId });
      window.setTimeout(() => setBusy(false), 3_000);
    },
    [busy, connected, sessionId],
  );
  const startQuestion = useCallback(() => command('question:start'), [command]);
  const nextQuestion = useCallback(() => command('question:next'), [command]);
  const skipQuestion = useCallback(() => command('question:skip'), [command]);
  const finishGame = useCallback(() => command('game:finish'), [command]);

  return {
    snapshot,
    stats,
    clockOffset,
    connected,
    message,
    busy,
    startQuestion,
    nextQuestion,
    skipQuestion,
    revealQuestion,
    finishGame,
    submitAnswer,
  };
}
