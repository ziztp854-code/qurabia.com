import { z } from 'zod';

export type LadderTeam = 'right' | 'left';
export type LadderRoomPhase = 'waiting' | 'active' | 'finished';
export type LadderQuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type LadderQuestion = {
  id: string;
  roomId: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  category: { id: string; name: string };
  difficulty: LadderQuestionDifficulty;
  timeLimit: number;
  roundNumber: number;
  createdAt: number;
};

export type LadderRoomSnapshot = {
  roomCode: string;
  phase: LadderRoomPhase;
  currentRound: number;
  totalRounds: number;
  rightScore: number;
  leftScore: number;
  rightPosition: number;
  leftPosition: number;
  winningPosition: number;
  questionTimeLimit: number;
  currentQuestion: LadderQuestion | null;
  rightTeam: Array<{ playerName: string; isHost: boolean }>;
  leftTeam: Array<{ playerName: string; isHost: boolean }>;
  isHost: boolean;
  startedAt?: number;
  endedAt?: number;
};

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

export type CreateLadderRoomPayload = z.output<typeof createLadderRoomPayloadSchema>;
export type JoinLadderRoomPayload = z.output<typeof joinLadderRoomPayloadSchema>;
export type StartLadderGamePayload = z.output<typeof startLadderGamePayloadSchema>;
export type LadderAnswerPayload = z.output<typeof ladderAnswerPayloadSchema>;
export type LadderReconnectPayload = z.output<typeof ladderReconnectPayloadSchema>;

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
