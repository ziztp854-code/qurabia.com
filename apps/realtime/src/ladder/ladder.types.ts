import { z } from 'zod';
import type {
  LadderQuestionDifficulty,
  LadderQuestion,
  LadderRoom,
  LadderRoomSnapshot,
} from '@tahaddi/domain';

export const LADDER_TTL_SECONDS = 3 * 60 * 60;
export const LADDER_ROOM_LOCK_MILLISECONDS = 10_000;
export const LADDER_MAX_TEAM_PLAYERS = 10;

const playerNameSchema = z.string().trim().min(2).max(30);
const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{8}$/i);

export const createLadderRoomPayloadSchema = z
  .object({
    totalRounds: z.number().int().min(5).max(20).default(10),
    winningPosition: z.number().int().min(5).max(20).default(10),
    questionTimeLimit: z.number().int().min(20).max(60).default(30),
    quizId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const joinLadderRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerName: playerNameSchema,
    team: z.enum(['right', 'left']),
  })
  .strict();

export const startLadderGamePayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
  })
  .strict();

export const ladderAnswerPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    questionId: z.string().min(1),
    optionId: z.string().min(1),
  })
  .strict();

export const ladderReconnectPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
  })
  .strict();

export type CreateLadderRoomPayload = z.output<
  typeof createLadderRoomPayloadSchema
>;
export type JoinLadderRoomPayload = z.output<
  typeof joinLadderRoomPayloadSchema
>;
export type StartLadderGamePayload = z.output<
  typeof startLadderGamePayloadSchema
>;
export type LadderAnswerPayload = z.output<typeof ladderAnswerPayloadSchema>;
export type LadderReconnectPayload = z.output<
  typeof ladderReconnectPayloadSchema
>;

export type ClientToServerLadderEvents = {
  'ladder:host': (payload: CreateLadderRoomPayload) => void;
  'ladder:join': (payload: JoinLadderRoomPayload) => void;
  'ladder:start': (payload: StartLadderGamePayload) => void;
  'ladder:answer': (payload: LadderAnswerPayload) => void;
  'ladder:leave': (payload: { roomCode?: string }) => void;
  'ladder:reconnect': (payload: LadderReconnectPayload) => void;
  'ladder:sync': (payload: { roomCode?: string }) => void;
};

export type ServerToClientLadderEvents = {
  'ladder:room:state': (payload: LadderRoomSnapshot) => void;
  'ladder:error': (payload: { code: string; message: string }) => void;
  'ladder:question:started': (
    payload: LadderQuestion & { timeLimit: number; roundNumber: number },
  ) => void;
  'ladder:question:ended': (payload: { questionId: string }) => void;
  'ladder:round:result': (payload: {
    roundNumber: number;
    rightPosition: number;
    leftPosition: number;
    rightScore: number;
    leftScore: number;
    winner: 'right' | 'left' | null;
  }) => void;
  'ladder:game:end': (payload: {
    winner: 'right' | 'left' | 'draw' | null;
    rightScore: number;
    leftScore: number;
    durationMs: number;
  }) => void;
  'ladder:countdown': (payload: { remaining: number }) => void;
};

export type LadderRoomRuntime = LadderRoom & {
  usedQuestionIds?: string[];
  recentCategoryIds?: string[];
  currentQuestionId?: string | null;
  currentDifficulty?: LadderQuestionDifficulty | null;
  questionOpenedAt?: number | null;
  questionDeadlineAt?: number | null;
  currentCorrectOptionId?: string | null;
  stopReason?: { code: string; message: string };
};

export type LadderActionResult =
  | { ok: true; room: LadderRoomRuntime }
  | { ok: false; code: string; message: string };
