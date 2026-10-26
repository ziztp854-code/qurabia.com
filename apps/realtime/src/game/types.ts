export type {
  AnswerRejectionReason,
  ClientToServerEvents,
  GamePhase,
  GameSnapshot,
  LiveRole,
  PlayerInfo,
  PlayerQuestionResult,
  QuestionOptionStats,
  QuestionPayload,
  QuestionRevealPayload,
  QuestionStatsPayload,
  ServerToClientEvents,
} from '@tahaddi/contracts';

export type LiveSocketIdentity = {
  sessionId: string;
  subjectId: string;
  role: 'host' | 'player';
};

export type { LiveConnectionMetadata } from './connection-metadata.js';

export type LiveGameState = {
  sessionId: string;
  roomCode: string;
  phase: 'LOBBY' | 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'FINISHED';
  currentQuestionPosition: number;
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  transitionDueAt: number | null;
  /** DB authority tuple; internal projection metadata, never a wire contract. */
  dbRevealedAt?: number | null;
  dbAdvanceAt?: number | null;
};

export type StoredAnswer = {
  optionId: string;
  receivedAt: number;
};
