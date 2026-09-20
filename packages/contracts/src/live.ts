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

/**
 * Short transport credential returned by a trusted HTTP endpoint. Clients must
 * treat it as opaque and must never attempt to mint or verify it themselves.
 */
export type LiveConnectionTicket = {
  sessionId: string;
  subjectId: string;
  role: LiveRole;
  accessToken: string;
  expiresAt: number;
  /** Revocation-sensitive account version. Present on authenticated host tickets. */
  subjectVersion?: number;
};

export const LIVE_TICKET_HEADERS = {
  sessionId: 'x-tahaddi-live-session-id',
  subjectId: 'x-tahaddi-live-subject-id',
  role: 'x-tahaddi-live-role',
  accessToken: 'x-tahaddi-live-token',
  expiresAt: 'x-tahaddi-live-expires-at',
  subjectVersion: 'x-tahaddi-live-subject-version',
} as const;

export function isLiveConnectionTicket(value: unknown): value is LiveConnectionTicket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ticket = value as Record<string, unknown>;
  return (
    typeof ticket.sessionId === 'string' &&
    ticket.sessionId.length > 0 &&
    typeof ticket.subjectId === 'string' &&
    ticket.subjectId.length > 0 &&
    (ticket.role === 'host' || ticket.role === 'player') &&
    typeof ticket.accessToken === 'string' &&
    ticket.accessToken.length > 0 &&
    typeof ticket.expiresAt === 'number' &&
    Number.isSafeInteger(ticket.expiresAt) &&
    ticket.expiresAt > Date.now() &&
    (ticket.subjectVersion === undefined ||
      (typeof ticket.subjectVersion === 'number' &&
        Number.isSafeInteger(ticket.subjectVersion) &&
        ticket.subjectVersion >= 0))
  );
}

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
  // Browser clients can omit expiresAt because the signed token carries it.
  'game:join': (payload: Omit<LiveConnectionTicket, 'expiresAt'> & { expiresAt?: number }) => void;
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
  'game:host_status': (payload: { connected: boolean }) => void;
  'clock:pong': (payload: { clientSentAt: number; serverTime: number }) => void;
  'game:error': (payload: { code: string; message: string }) => void;
};
