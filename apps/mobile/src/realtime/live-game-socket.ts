import type { LiveConnectionTicket, ServerToClientEvents } from '@tahaddi/contracts/client';
import { LIVE_TICKET_HEADERS } from '@tahaddi/contracts/client';
import type { LiveGameAction } from './live-game-state';

type SocketListener = (...args: unknown[]) => void;

export type LiveGameSocketPort = {
  connected: boolean;
  on(event: string, listener: SocketListener): unknown;
  off(event: string, listener: SocketListener): unknown;
  emit(event: string, payload: unknown): unknown;
  io: {
    on(event: string, listener: SocketListener): unknown;
    off(event: string, listener: SocketListener): unknown;
  };
};

type Dispatch = (action: LiveGameAction) => void;
type ServerEvent = keyof ServerToClientEvents;

export function liveTicketHeaders(ticket: LiveConnectionTicket): Record<string, string> {
  return {
    [LIVE_TICKET_HEADERS.sessionId]: ticket.sessionId,
    [LIVE_TICKET_HEADERS.subjectId]: ticket.subjectId,
    [LIVE_TICKET_HEADERS.role]: ticket.role,
    [LIVE_TICKET_HEADERS.accessToken]: ticket.accessToken,
    [LIVE_TICKET_HEADERS.expiresAt]: String(ticket.expiresAt),
    ...(ticket.subjectVersion === undefined
      ? {}
      : { [LIVE_TICKET_HEADERS.subjectVersion]: String(ticket.subjectVersion) }),
  };
}

function firstPayload<EventName extends ServerEvent>(
  args: unknown[],
): Parameters<ServerToClientEvents[EventName]>[0] {
  return args[0] as Parameters<ServerToClientEvents[EventName]>[0];
}

/**
 * Binds the existing live-game protocol to a socket. `connect` fires after the
 * initial connection and after every automatic reconnection, so re-emitting
 * `game:join` asks the authoritative server for a fresh `game:snapshot`.
 */
export function bindLiveGameSocket(
  socket: LiveGameSocketPort,
  ticket: LiveConnectionTicket,
  dispatch: Dispatch,
) {
  const onConnect: SocketListener = () => {
    dispatch({ type: 'socketConnected' });
    socket.emit('game:join', ticket);
  };
  const onDisconnect: SocketListener = () => dispatch({ type: 'disconnected' });
  const onReconnectAttempt: SocketListener = () => dispatch({ type: 'reconnecting' });
  const onConnectError: SocketListener = () =>
    dispatch({
      type: 'gameError',
      payload: {
        code: 'CONNECTION_FAILED',
        message: 'تعذّر الاتصال بالخادم اللحظي. سنحاول مجددًا تلقائيًا.',
      },
    });
  const onSnapshot: SocketListener = (...args) =>
    dispatch({ type: 'snapshot', snapshot: firstPayload<'game:snapshot'>(args) });
  const onQuestionStarted: SocketListener = (...args) =>
    dispatch({ type: 'questionStarted', payload: firstPayload<'question:started'>(args) });
  const onQuestionStats: SocketListener = (...args) =>
    dispatch({ type: 'questionStats', payload: firstPayload<'question:stats'>(args) });
  const onQuestionRevealed: SocketListener = (...args) =>
    dispatch({ type: 'questionRevealed', payload: firstPayload<'question:revealed'>(args) });
  const onLeaderboardShown: SocketListener = (...args) =>
    dispatch({ type: 'leaderboardShown', payload: firstPayload<'leaderboard:shown'>(args) });
  const onPlayerJoined: SocketListener = (...args) =>
    dispatch({ type: 'playerJoined', payload: firstPayload<'game:player_joined'>(args) });
  const onPlayerLeft: SocketListener = (...args) =>
    dispatch({ type: 'playerLeft', payload: firstPayload<'game:player_left'>(args) });
  const onHostStatus: SocketListener = (...args) =>
    dispatch({ type: 'hostStatus', payload: firstPayload<'game:host_status'>(args) });
  const onAnswerAccepted: SocketListener = (...args) =>
    dispatch({ type: 'answerAccepted', payload: firstPayload<'answer:accepted'>(args) });
  const onAnswerRejected: SocketListener = (...args) =>
    dispatch({ type: 'answerRejected', payload: firstPayload<'answer:rejected'>(args) });
  const onFinished: SocketListener = (...args) =>
    dispatch({ type: 'finished', payload: firstPayload<'game:finished'>(args) });
  const onGameError: SocketListener = (...args) =>
    dispatch({ type: 'gameError', payload: firstPayload<'game:error'>(args) });

  const socketListeners: Array<[string, SocketListener]> = [
    ['connect', onConnect],
    ['disconnect', onDisconnect],
    ['connect_error', onConnectError],
    ['game:snapshot', onSnapshot],
    ['question:started', onQuestionStarted],
    ['question:stats', onQuestionStats],
    ['question:revealed', onQuestionRevealed],
    ['leaderboard:shown', onLeaderboardShown],
    ['game:player_joined', onPlayerJoined],
    ['game:player_left', onPlayerLeft],
    ['game:host_status', onHostStatus],
    ['answer:accepted', onAnswerAccepted],
    ['answer:rejected', onAnswerRejected],
    ['game:finished', onFinished],
    ['game:error', onGameError],
  ];

  for (const [event, listener] of socketListeners) socket.on(event, listener);
  socket.io.on('reconnect_attempt', onReconnectAttempt);
  if (socket.connected) onConnect();

  return () => {
    for (const [event, listener] of socketListeners) socket.off(event, listener);
    socket.io.off('reconnect_attempt', onReconnectAttempt);
  };
}
