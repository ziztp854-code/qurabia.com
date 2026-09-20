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
  subjectVersion?: number;
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
};

export type StoredAnswer = {
  optionId: string;
  receivedAt: number;
};
