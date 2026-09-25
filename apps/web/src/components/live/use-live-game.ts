'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateClockOffset,
  type AnswerRejectionReason,
  type ClientToServerEvents,
  type GameSnapshot,
  type LiveRole,
  type QuestionPayload,
  type QuestionRevealPayload,
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
  const activeQuestionId = useRef<string | null>(null);
  const latestStartedQuestion = useRef<QuestionPayload | null>(null);
  const latestReveal = useRef<QuestionRevealPayload | null>(null);
  const pending = useRef(false);
  const pendingTimer = useRef<number | undefined>(undefined);
  const bestRtt = useRef(Number.POSITIVE_INFINITY);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [stats, setStats] = useState<QuestionStatsPayload | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('جارٍ الاتصال بالغرفة…');
  const [busy, setBusy] = useState(false);

  const settlePending = useCallback(() => {
    window.clearTimeout(pendingTimer.current);
    pendingTimer.current = undefined;
    pending.current = false;
    setBusy(false);
  }, []);

  const beginPending = useCallback(() => {
    if (pending.current || !socketRef.current?.connected) return false;
    pending.current = true;
    setBusy(true);
    pendingTimer.current = window.setTimeout(() => {
      settlePending();
      setMessage('جارٍ التحقق من حالة الغرفة…');
      if (socketRef.current?.connected) {
        socketRef.current.emit('game:join', {
          sessionId,
          subjectId,
          accessToken,
          role,
          deviceId: getOrCreateDeviceId(),
        });
      }
    }, 5_000);
    return true;
  }, [accessToken, role, sessionId, subjectId, settlePending]);

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
      latestStartedQuestion.current = null;
      latestReveal.current = null;
      setConnected(true);
      setMessage('');
      bestRtt.current = Number.POSITIVE_INFINITY;
      socket.emit('game:join', { sessionId, subjectId, accessToken, role, deviceId });
      socket.emit('clock:ping', { clientSentAt: Date.now() });
    };
    const disconnected = () => {
      settlePending();
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
      const started = latestStartedQuestion.current;
      const restored =
        started &&
        next.phase !== 'FINISHED' &&
        started.questionStartedAt > (next.question?.questionStartedAt ?? 0)
          ? {
              ...next,
              phase:
                latestReveal.current?.questionId === started.questionId
                  ? ('REVEAL' as const)
                  : ('QUESTION' as const),
              question: started,
              reveal:
                latestReveal.current?.questionId === started.questionId
                  ? latestReveal.current
                  : null,
              playerAnswer: null,
              playerResult:
                latestReveal.current?.questionId === started.questionId
                  ? (latestReveal.current.playerResult ?? null)
                  : null,
            }
          : next;
      activeQuestionId.current =
        restored.phase === 'FINISHED' ? null : (restored.question?.questionId ?? null);
      setSnapshot((current) =>
        restored !== next &&
        current &&
        current.question?.questionId === restored.question?.questionId
          ? { ...restored, playerAnswer: current.playerAnswer }
          : restored,
      );
      setStats(restored.reveal?.stats ?? null);
      settlePending();
      setMessage('');
    });
    socket.on('question:started', (question) => {
      latestStartedQuestion.current = question;
      latestReveal.current = null;
      activeQuestionId.current = question.questionId;
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
      settlePending();
      setMessage('');
    });
    socket.on('answer:accepted', ({ questionId, receivedAt }) => {
      if (questionId !== activeQuestionId.current) return;
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
      settlePending();
      setMessage('تم استلام إجابتك.');
    });
    socket.on('answer:rejected', ({ questionId, reason }) => {
      if (questionId !== activeQuestionId.current) return;
      if (reason !== 'DUPLICATE_ANSWER') {
        setSnapshot((current) => (current ? { ...current, playerAnswer: null } : current));
      } else {
        socket.emit('game:join', { sessionId, subjectId, accessToken, role, deviceId });
      }
      settlePending();
      setMessage(rejectionMessages[reason]);
    });
    socket.on('question:stats', (next) => {
      if (next.questionId === activeQuestionId.current) setStats(next);
    });
    socket.on('question:revealed', (reveal) => {
      if (reveal.questionId !== activeQuestionId.current) return;
      latestReveal.current = reveal;
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
      settlePending();
    });
    socket.on('leaderboard:shown', ({ leaderboard }) => {
      latestStartedQuestion.current = null;
      latestReveal.current = null;
      setSnapshot((current) =>
        current ? { ...current, phase: 'LEADERBOARD', leaderboard } : current,
      );
      settlePending();
    });
    socket.on('game:finished', ({ leaderboard }) => {
      latestStartedQuestion.current = null;
      latestReveal.current = null;
      activeQuestionId.current = null;
      setSnapshot((current) =>
        current ? { ...current, phase: 'FINISHED', leaderboard } : current,
      );
      settlePending();
    });
    socket.on('game:player_joined', ({ player, participantCount }) => {
      setSnapshot((current) => {
        if (!current) return current;
        if (current.phase === 'FINISHED') return { ...current, participantCount };
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
                current.phase === 'FINISHED'
                  ? current.leaderboard
                  : role === 'host'
                    ? current.leaderboard.filter((item) => item.id !== playerId)
                    : [],
            }
          : current,
      );
    });
    socket.on('game:error', ({ message: errorMessage }) => {
      settlePending();
      setMessage(errorMessage);
    });

    const clockTimer = window.setInterval(() => {
      if (socket.connected) socket.emit('clock:ping', { clientSentAt: Date.now() });
    }, 10_000);

    return () => {
      window.clearTimeout(pendingTimer.current);
      pending.current = false;
      window.clearInterval(clockTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, role, sessionId, subjectId, settlePending]);

  const command = useCallback(
    (event: 'question:start' | 'question:next' | 'question:skip' | 'game:finish') => {
      if (!connected || busy || !beginPending()) return;
      socketRef.current?.emit(event, { sessionId });
    },
    [busy, connected, sessionId, beginPending],
  );

  const submitAnswer = useCallback(
    (questionId: string, optionId: string) => {
      if (
        !connected ||
        busy ||
        !socketRef.current?.connected ||
        snapshot?.playerAnswer ||
        snapshot?.phase !== 'QUESTION' ||
        snapshot.question?.questionId !== questionId
      )
        return;
      if (!beginPending()) return;
      setSnapshot((current) =>
        current
          ? {
              ...current,
              playerAnswer: { optionId, receivedAt: 0 },
            }
          : current,
      );
      socketRef.current.emit('answer:submit', {
        sessionId,
        questionId,
        optionId,
      });
    },
    [busy, connected, sessionId, snapshot, beginPending],
  );
  const revealQuestion = useCallback(
    (questionId: string) => {
      if (!connected || busy || !questionId || !socketRef.current?.connected) return;
      if (!beginPending()) return;
      socketRef.current.emit('question:reveal', { sessionId, questionId });
    },
    [busy, connected, sessionId, beginPending],
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
