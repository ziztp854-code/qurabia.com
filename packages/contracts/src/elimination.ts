import { z } from 'zod';

export type EliminationRoomPhase = 'waiting' | 'active' | 'between' | 'finished';
export type EliminationDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type EliminationPlayerView = {
  id: string;
  name: string;
  alive: boolean;
  eliminatedAtRound: number | null;
  hasAnswered: boolean;
  isViewer: boolean;
};

export type EliminationRoundResult = {
  roundNumber: number;
  questionId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: EliminationDifficulty;
  survivorIds: string[];
  eliminatedIds: string[];
  everyoneCorrect: boolean;
};

export type EliminationRoomSnapshot = {
  roomCode: string;
  phase: EliminationRoomPhase;
  isHost: boolean;
  viewerPlayerId: string | null;
  currentRound: number;
  totalRounds: number;
  roundTimeLimit: number;
  aliveCount: number;
  players: EliminationPlayerView[];
  currentQuestion: {
    id: string;
    prompt: string;
    options: string[];
    difficulty: EliminationDifficulty;
    roundNumber: number;
    timeLimit: number;
  } | null;
  myAnswer: number | null;
  revealedCorrectIndex: number | null;
  remainingSeconds: number | null;
  lastRoundResult: EliminationRoundResult | null;
  startedAt?: number;
  endedAt?: number;
};

const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/i);
const playerNameSchema = z.string().trim().min(2).max(30);

export const createEliminationRoomPayloadSchema = z
  .object({
    totalRounds: z.number().int().min(3).max(8).default(5),
    roundTimeLimit: z.number().int().min(10).max(90).default(20),
  })
  .strict();

export const joinEliminationRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerName: playerNameSchema,
  })
  .strict();

export const eliminationAnswerSubmitPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    questionId: z.string().trim().min(1).max(64),
    optionIndex: z.number().int().min(0).max(3),
    submissionId: z.string().trim().min(8).max(64),
  })
  .strict();

export const eliminationRoomCodePayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
  })
  .strict();

export type CreateEliminationRoomPayload = z.output<
  typeof createEliminationRoomPayloadSchema
>;
export type JoinEliminationRoomPayload = z.output<
  typeof joinEliminationRoomPayloadSchema
>;
export type EliminationAnswerSubmitPayload = z.output<
  typeof eliminationAnswerSubmitPayloadSchema
>;

export type EliminationAnswerAcceptedPayload = {
  submissionId: string;
  questionId: string;
  optionIndex: number;
};

export type EliminationRoundEndedPayload = {
  result: EliminationRoundResult;
};

export type EliminationGameEndedPayload = {
  championId: string | null;
  championName: string | null;
  runnerUpId: string | null;
  runnerUpName: string | null;
  totalRounds: number;
  durationMs: number;
};

export type ClientToServerEliminationEvents = {
  'elimination:host': (payload: CreateEliminationRoomPayload) => void;
  'elimination:join': (payload: JoinEliminationRoomPayload) => void;
  'elimination:start': (payload: { roomCode?: string }) => void;
  'elimination:answer:submit': (
    payload: EliminationAnswerSubmitPayload,
  ) => void;
  'elimination:next': (payload: { roomCode?: string }) => void;
  'elimination:round:end': (payload: { roomCode?: string }) => void;
  'elimination:game:finish': (payload: { roomCode?: string }) => void;
  'elimination:leave': (payload: { roomCode?: string }) => void;
  'elimination:reconnect': (payload: { roomCode?: string }) => void;
  'elimination:sync': (payload: { roomCode?: string }) => void;
};

export type ServerToClientEliminationEvents = {
  'elimination:room:state': (payload: EliminationRoomSnapshot) => void;
  'elimination:error': (payload: { code: string; message: string }) => void;
  'elimination:countdown': (payload: { remaining: number }) => void;
  'elimination:answer:accepted': (
    payload: EliminationAnswerAcceptedPayload,
  ) => void;
  'elimination:answer:rejected': (payload: {
    submissionId: string;
    code: string;
    message: string;
  }) => void;
  'elimination:round:ended': (payload: EliminationRoundEndedPayload) => void;
  'elimination:game:ended': (payload: EliminationGameEndedPayload) => void;
};
