// REST envelopes stay separate from the transient live-game protocol.
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
};

export type GamePhase = 'LOBBY' | 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'FINISHED';
export type LiveRole = 'host' | 'player';

export type PlayerInfo = {
  id: string;
  name: string;
  score: number;
  streak: number;
  rank: number;
  correctAnswers?: number;
};

export type QuestionOptionPayload = {
  id: string;
  text: string;
  position: number;
};

export type QuestionMediaPayload = {
  type: 'image' | 'video';
  url: string;
  alt?: string;
};

/** Safe to send during QUESTION: it never contains the correct option. */
export type QuestionPayload = {
  questionId: string;
  prompt: string;
  options: QuestionOptionPayload[];
  media: QuestionMediaPayload[];
  questionStartedAt: number;
  questionEndsAt: number;
  questionNumber: number;
  totalQuestions: number;
};

export type QuestionOptionStats = {
  optionId: string;
  count: number;
  percentage: number;
};

export type QuestionStatsPayload = {
  questionId: string;
  answeredCount: number;
  participantCount: number;
  options: QuestionOptionStats[];
};

export type PlayerQuestionResult = {
  optionId: string;
  correct: boolean;
  earnedPoints: number;
  totalScore: number;
  rank: number;
};

export type QuestionRevealPayload = {
  questionId: string;
  correctOptionId: string;
  explanation: string | null;
  stats: QuestionStatsPayload;
  playerResult?: PlayerQuestionResult | null;
};

export type GameSnapshot = {
  sessionId: string;
  roomCode: string;
  phase: GamePhase;
  serverTime: number;
  question: QuestionPayload | null;
  reveal: QuestionRevealPayload | null;
  leaderboard: PlayerInfo[];
  participantCount: number;
  playerAnswer: {
    optionId: string;
    receivedAt: number;
  } | null;
  playerResult: PlayerQuestionResult | null;
};

export type AnswerRejectionReason =
  | 'INVALID_SESSION'
  | 'INVALID_PLAYER'
  | 'QUESTION_NOT_ACTIVE'
  | 'QUESTION_MISMATCH'
  | 'INVALID_OPTION'
  | 'DUPLICATE_ANSWER'
  | 'ANSWER_TOO_LATE';

export type ClientToServerEvents = {
  'game:join': (payload: {
    sessionId: string;
    subjectId: string;
    accessToken: string;
    role: LiveRole;
    deviceId?: string;
  }) => void;
  'question:start': (payload: { sessionId: string }) => void;
  'question:next': (payload: { sessionId: string }) => void;
  'question:skip': (payload: { sessionId: string }) => void;
  'question:reveal': (payload: { sessionId: string; questionId: string }) => void;
  'answer:submit': (payload: { sessionId: string; questionId: string; optionId: string }) => void;
  'game:finish': (payload: { sessionId: string }) => void;
  'clock:ping': (payload: { clientSentAt: number }) => void;
};

export type ServerToClientEvents = {
  'game:snapshot': (payload: GameSnapshot) => void;
  'question:started': (payload: QuestionPayload) => void;
  'answer:accepted': (payload: { questionId: string; receivedAt: number }) => void;
  'answer:rejected': (payload: { questionId: string; reason: AnswerRejectionReason }) => void;
  'question:stats': (payload: QuestionStatsPayload) => void;
  'question:revealed': (payload: QuestionRevealPayload) => void;
  'leaderboard:shown': (payload: { leaderboard: PlayerInfo[] }) => void;
  'game:finished': (payload: { leaderboard: PlayerInfo[]; sessionId: string }) => void;
  'game:player_joined': (payload: { player: PlayerInfo; participantCount: number }) => void;
  'game:player_left': (payload: { playerId: string; participantCount: number }) => void;
  'clock:pong': (payload: { clientSentAt: number; serverTime: number }) => void;
  'game:error': (payload: { code: string; message: string }) => void;
};

export * from './live-access-token';
export * from './live-timing';
export * from './ai-game-draft-token';
export * from './clock-sync';
export * from './display-controller';
export * from './mafia-display';
export * from './ladder';
export * from './ladder-host-access-token';
export * from './scrambled-words';
export * from './scrambled-words-host-access-token';
export * from './elimination';
export * from './elimination-host-access-token';
export * from './quiz-builder';
