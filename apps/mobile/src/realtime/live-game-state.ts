import type {
  AnswerRejectionReason,
  GameSnapshot,
  PlayerInfo,
  QuestionPayload,
  QuestionRevealPayload,
  QuestionStatsPayload,
  ServerToClientEvents,
} from '@tahaddi/contracts/client';

export type LiveConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type LiveAnswerState =
  | { status: 'submitting'; questionId: string; optionId: string }
  | { status: 'accepted'; questionId: string; optionId: string; receivedAt: number }
  | { status: 'rejected'; questionId: string; reason: AnswerRejectionReason }
  | null;

export type LiveGameClientState = {
  connection: LiveConnectionState;
  snapshot: GameSnapshot | null;
  players: PlayerInfo[];
  questionStats: QuestionStatsPayload | null;
  answer: LiveAnswerState;
  clockOffset: number;
  hostConnected: boolean | null;
  error: { code: string; message: string } | null;
};

type PlayerJoinedPayload = Parameters<ServerToClientEvents['game:player_joined']>[0];
type PlayerLeftPayload = Parameters<ServerToClientEvents['game:player_left']>[0];
type AnswerAcceptedPayload = Parameters<ServerToClientEvents['answer:accepted']>[0];
type AnswerRejectedPayload = Parameters<ServerToClientEvents['answer:rejected']>[0];
type LeaderboardPayload = Parameters<ServerToClientEvents['leaderboard:shown']>[0];
type FinishedPayload = Parameters<ServerToClientEvents['game:finished']>[0];
type GameErrorPayload = Parameters<ServerToClientEvents['game:error']>[0];

export type LiveGameAction =
  | { type: 'connecting' }
  | { type: 'socketConnected' }
  | { type: 'reconnecting' }
  | { type: 'disconnected' }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'questionStarted'; payload: QuestionPayload }
  | { type: 'questionStats'; payload: QuestionStatsPayload }
  | { type: 'questionRevealed'; payload: QuestionRevealPayload }
  | { type: 'leaderboardShown'; payload: LeaderboardPayload }
  | { type: 'playerJoined'; payload: PlayerJoinedPayload }
  | { type: 'playerLeft'; payload: PlayerLeftPayload }
  | { type: 'answerSubmitted'; payload: { questionId: string; optionId: string } }
  | { type: 'answerAccepted'; payload: AnswerAcceptedPayload }
  | { type: 'answerRejected'; payload: AnswerRejectedPayload }
  | { type: 'clockSynchronized'; offset: number }
  | { type: 'hostStatus'; payload: { connected: boolean } }
  | { type: 'finished'; payload: FinishedPayload }
  | { type: 'gameError'; payload: GameErrorPayload };

export function createInitialLiveGameState(): LiveGameClientState {
  return {
    connection: 'idle',
    snapshot: null,
    players: [],
    questionStats: null,
    answer: null,
    clockOffset: 0,
    hostConnected: null,
    error: null,
  };
}

function updateSnapshot(
  state: LiveGameClientState,
  update: (snapshot: GameSnapshot) => GameSnapshot,
) {
  return state.snapshot ? update(state.snapshot) : null;
}

export function liveGameReducer(
  state: LiveGameClientState,
  action: LiveGameAction,
): LiveGameClientState {
  switch (action.type) {
    case 'connecting':
      return { ...state, connection: 'connecting', error: null };
    case 'socketConnected':
      return { ...state, connection: 'connected', error: null };
    case 'reconnecting':
      return { ...state, connection: 'reconnecting' };
    case 'disconnected':
      return { ...state, connection: 'disconnected' };
    case 'snapshot':
      return {
        ...state,
        connection: 'connected',
        snapshot: action.snapshot,
        players: action.snapshot.leaderboard,
        questionStats: action.snapshot.reveal?.stats ?? null,
        answer: action.snapshot.playerAnswer
          ? {
              status: 'accepted',
              questionId: action.snapshot.question?.questionId ?? '',
              optionId: action.snapshot.playerAnswer.optionId,
              receivedAt: action.snapshot.playerAnswer.receivedAt,
            }
          : null,
        error: null,
      };
    case 'questionStarted':
      return {
        ...state,
        snapshot: updateSnapshot(state, (snapshot) => ({
          ...snapshot,
          phase: 'QUESTION',
          question: action.payload,
          reveal: null,
          playerAnswer: null,
          playerResult: null,
        })),
        questionStats: null,
        answer: null,
        error: null,
      };
    case 'questionStats':
      return { ...state, questionStats: action.payload };
    case 'questionRevealed':
      return {
        ...state,
        snapshot: updateSnapshot(state, (snapshot) => ({
          ...snapshot,
          phase: 'REVEAL',
          reveal: action.payload,
          playerResult: action.payload.playerResult ?? null,
        })),
        questionStats: action.payload.stats,
      };
    case 'leaderboardShown':
      return {
        ...state,
        snapshot: updateSnapshot(state, (snapshot) => ({
          ...snapshot,
          phase: 'LEADERBOARD',
          leaderboard: action.payload.leaderboard,
        })),
        players: action.payload.leaderboard,
      };
    case 'playerJoined': {
      const players = [
        ...state.players.filter((player) => player.id !== action.payload.player.id),
        action.payload.player,
      ];
      return {
        ...state,
        players,
        snapshot: updateSnapshot(state, (snapshot) => ({
          ...snapshot,
          participantCount: action.payload.participantCount,
        })),
      };
    }
    case 'playerLeft':
      return {
        ...state,
        players: state.players.filter((player) => player.id !== action.payload.playerId),
        snapshot: updateSnapshot(state, (snapshot) => ({
          ...snapshot,
          participantCount: action.payload.participantCount,
        })),
      };
    case 'answerSubmitted':
      return {
        ...state,
        answer: { status: 'submitting', ...action.payload },
        error: null,
      };
    case 'answerAccepted': {
      const optionId =
        state.answer?.status === 'submitting' &&
        state.answer.questionId === action.payload.questionId
          ? state.answer.optionId
          : state.snapshot?.playerAnswer?.optionId;
      return {
        ...state,
        answer: optionId ? { status: 'accepted', optionId, ...action.payload } : state.answer,
        snapshot: optionId
          ? updateSnapshot(state, (snapshot) => ({
              ...snapshot,
              playerAnswer: { optionId, receivedAt: action.payload.receivedAt },
            }))
          : state.snapshot,
      };
    }
    case 'answerRejected':
      return {
        ...state,
        answer: { status: 'rejected', ...action.payload },
      };
    case 'clockSynchronized':
      return { ...state, clockOffset: action.offset };
    case 'hostStatus':
      return { ...state, hostConnected: action.payload.connected };
    case 'finished':
      return {
        ...state,
        snapshot: updateSnapshot(state, (snapshot) => ({
          ...snapshot,
          phase: 'FINISHED',
          question: null,
          reveal: null,
          leaderboard: action.payload.leaderboard,
        })),
        players: action.payload.leaderboard,
      };
    case 'gameError':
      return { ...state, error: action.payload };
  }
}
