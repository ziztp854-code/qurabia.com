import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  calculateClockOffset,
  isLiveConnectionTicket,
  type ClientToServerEvents,
  type LiveConnectionTicket,
  type ServerToClientEvents,
} from '@tahaddi/contracts/client';
import { io, type Socket } from 'socket.io-client';
import { mobileEnvironment } from '../core/environment';
import { bindLiveGameSocket, liveTicketHeaders, type LiveGameSocketPort } from './live-game-socket';
import { createInitialLiveGameState, liveGameReducer } from './live-game-state';

type LiveSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type HostCommand = 'question:start' | 'question:next' | 'question:skip' | 'game:finish';

export function useLiveGame(ticket: LiveConnectionTicket | null) {
  const [state, dispatch] = useReducer(liveGameReducer, undefined, createInitialLiveGameState);
  const socketRef = useRef<LiveSocket | null>(null);

  useEffect(() => {
    if (!isLiveConnectionTicket(ticket)) {
      dispatch({
        type: 'gameError',
        payload: { code: 'INVALID_TICKET', message: 'تذكرة الاتصال بالجلسة غير صالحة.' },
      });
      return;
    }

    dispatch({ type: 'connecting' });
    const socket: LiveSocket = io(mobileEnvironment.realtimeUrl, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Number.POSITIVE_INFINITY,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
      timeout: 10_000,
      extraHeaders: liveTicketHeaders(ticket),
    });
    socketRef.current = socket;
    const unbind = bindLiveGameSocket(socket as unknown as LiveGameSocketPort, ticket, dispatch);
    let bestRtt = Number.POSITIVE_INFINITY;

    const synchronizeClock = ({
      clientSentAt,
      serverTime,
    }: Parameters<ServerToClientEvents['clock:pong']>[0]) => {
      const clientReceivedAt = Date.now();
      const rtt = Math.max(0, clientReceivedAt - clientSentAt);
      if (rtt > bestRtt) return;
      bestRtt = rtt;
      dispatch({
        type: 'clockSynchronized',
        offset: calculateClockOffset({ clientSentAt, clientReceivedAt, serverTime }),
      });
    };
    const pingClock = () => {
      if (socket.connected) socket.emit('clock:ping', { clientSentAt: Date.now() });
    };
    socket.on('clock:pong', synchronizeClock);
    socket.on('connect', pingClock);
    const clockTimer = setInterval(pingClock, 10_000);
    socket.connect();

    return () => {
      clearInterval(clockTimer);
      socket.off('connect', pingClock);
      socket.off('clock:pong', synchronizeClock);
      unbind();
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [
    ticket?.accessToken,
    ticket?.expiresAt,
    ticket?.role,
    ticket?.sessionId,
    ticket?.subjectId,
    ticket?.subjectVersion,
  ]);

  const emitHostCommand = useCallback(
    (event: HostCommand) => {
      const socket = socketRef.current;
      if (!ticket || ticket.role !== 'host' || !socket?.connected) return false;
      socket.emit(event, { sessionId: ticket.sessionId });
      return true;
    },
    [ticket],
  );

  const revealQuestion = useCallback(
    (questionId: string) => {
      const socket = socketRef.current;
      if (!ticket || ticket.role !== 'host' || !socket?.connected || !questionId) return false;
      socket.emit('question:reveal', { sessionId: ticket.sessionId, questionId });
      return true;
    },
    [ticket],
  );

  const submitAnswer = useCallback(
    (questionId: string, optionId: string) => {
      const socket = socketRef.current;
      if (
        !ticket ||
        ticket.role !== 'player' ||
        !socket?.connected ||
        !questionId ||
        !optionId ||
        state.snapshot?.phase !== 'QUESTION' ||
        state.snapshot.question?.questionId !== questionId ||
        state.snapshot.playerAnswer ||
        state.answer?.status === 'submitting'
      ) {
        return false;
      }
      dispatch({ type: 'answerSubmitted', payload: { questionId, optionId } });
      socket.emit('answer:submit', { sessionId: ticket.sessionId, questionId, optionId });
      return true;
    },
    [state.answer?.status, state.snapshot, ticket],
  );

  return {
    state,
    startQuestion: () => emitHostCommand('question:start'),
    nextQuestion: () => emitHostCommand('question:next'),
    skipQuestion: () => emitHostCommand('question:skip'),
    finishGame: () => emitHostCommand('game:finish'),
    revealQuestion,
    submitAnswer,
  };
}
