import { z } from 'zod';

export type ScrambledWordsRoomPhase = 'waiting' | 'active' | 'finished';

export type ScrambledWordsPuzzleView = {
  id: string;
  imageUrl: string;
  fragments: string[];
  wordLengths: number[];
  timeLimit: number;
  roundNumber: number;
};

export type ScrambledWordsPlayerView = {
  id: string;
  name: string;
  score: number;
  roundScore: number;
  solvedCount: number;
  wordCount: number;
  finished: boolean;
  isViewer: boolean;
};

export type ScrambledWordsRoundResult = {
  id: string;
  name: string;
  roundScore: number;
  totalScore: number;
};

export type ScrambledWordsRoomSnapshot = {
  roomCode: string;
  phase: ScrambledWordsRoomPhase;
  isHost: boolean;
  viewerPlayerId: string | null;
  currentRound: number;
  totalRounds: number;
  roundTimeLimit: number;
  firstFinish: boolean;
  players: ScrambledWordsPlayerView[];
  currentPuzzle: ScrambledWordsPuzzleView | null;
  mySolvedWords: string[];
  remainingSeconds: number | null;
  lastRoundWords: string[];
  lastRoundResults: ScrambledWordsRoundResult[];
  startedAt?: number;
  endedAt?: number;
};

const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-HJ-NP-Z2-9]{6}$/i);
const playerNameSchema = z.string().trim().min(2).max(30);
const puzzleWordSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => value.replace(/\s+/g, ' '));

export const createScrambledWordsRoomPayloadSchema = z
  .object({
    totalRounds: z.number().int().min(1).max(30).default(8),
    roundTimeLimit: z.number().int().min(15).max(300).default(60),
    firstFinish: z.boolean().default(false),
  })
  .strict();

export const joinScrambledWordsRoomPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    playerName: playerNameSchema,
  })
  .strict();

export const scrambledWordsWordSubmitPayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
    puzzleId: z.string().trim().min(1).max(64),
    word: puzzleWordSchema,
    submissionId: z.string().trim().min(8).max(64),
  })
  .strict();

export const scrambledWordsRoomCodePayloadSchema = z
  .object({
    roomCode: roomCodeSchema,
  })
  .strict();

export type CreateScrambledWordsRoomPayload = z.output<
  typeof createScrambledWordsRoomPayloadSchema
>;
export type JoinScrambledWordsRoomPayload = z.output<
  typeof joinScrambledWordsRoomPayloadSchema
>;
export type ScrambledWordsWordSubmitPayload = z.output<
  typeof scrambledWordsWordSubmitPayloadSchema
>;

export type ScrambledWordsWordAcceptedPayload = {
  submissionId: string;
  puzzleId: string;
  word: string;
  points: number;
  totalScore: number;
  solvedWords: string[];
  finished: boolean;
};

export type ScrambledWordsRoundEndedPayload = {
  roundNumber: number;
  words: string[];
  results: ScrambledWordsRoundResult[];
};

export type ScrambledWordsGameEndedPayload = {
  results: ScrambledWordsRoundResult[];
  durationMs: number;
};

export type ClientToServerScrambledWordsEvents = {
  'scrambled:host': (payload: CreateScrambledWordsRoomPayload) => void;
  'scrambled:join': (payload: JoinScrambledWordsRoomPayload) => void;
  'scrambled:start': (payload: { roomCode?: string }) => void;
  'scrambled:word:submit': (payload: ScrambledWordsWordSubmitPayload) => void;
  'scrambled:next': (payload: { roomCode?: string }) => void;
  'scrambled:round:end': (payload: { roomCode?: string }) => void;
  'scrambled:game:finish': (payload: { roomCode?: string }) => void;
  'scrambled:leave': (payload: { roomCode?: string }) => void;
  'scrambled:reconnect': (payload: { roomCode?: string }) => void;
  'scrambled:sync': (payload: { roomCode?: string }) => void;
};

export type ServerToClientScrambledWordsEvents = {
  'scrambled:room:state': (payload: ScrambledWordsRoomSnapshot) => void;
  'scrambled:error': (payload: { code: string; message: string }) => void;
  'scrambled:countdown': (payload: { remaining: number }) => void;
  'scrambled:word:accepted': (payload: ScrambledWordsWordAcceptedPayload) => void;
  'scrambled:word:rejected': (payload: {
    submissionId: string;
    code: string;
    message: string;
  }) => void;
  'scrambled:round:ended': (payload: ScrambledWordsRoundEndedPayload) => void;
  'scrambled:game:ended': (payload: ScrambledWordsGameEndedPayload) => void;
};
