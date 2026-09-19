import { z } from 'zod';
import type {
  ScrambledWordsRoom,
  ScrambledWordsRoomSnapshot,
} from '@tahaddi/domain';
import {
  SCRAMBLED_WORDS_MAX_PLAYERS,
  SCRAMBLED_WORDS_SCORING_POLICY_VERSION,
  SCRAMBLED_WORDS_TTL_SECONDS,
} from '@tahaddi/domain';

export {
  SCRAMBLED_WORDS_MAX_PLAYERS,
  SCRAMBLED_WORDS_SCORING_POLICY_VERSION,
  SCRAMBLED_WORDS_TTL_SECONDS,
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

export type ScrambledWordsRoomRuntime = ScrambledWordsRoom & {
  stopReason?: { code: string; message: string };
};

export type ScrambledWordsActionResult =
  | { ok: true; room: ScrambledWordsRoomRuntime }
  | { ok: false; code: string; message: string };

export type ScrambledWordsWordSubmitResult =
  | {
      ok: true;
      room: ScrambledWordsRoomRuntime;
      accepted: {
        submissionId: string;
        puzzleId: string;
        word: string;
        points: number;
        totalScore: number;
        solvedWords: string[];
        finished: boolean;
      };
    }
  | { ok: false; code: string; message: string; submissionId?: string };

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
  'scrambled:word:accepted': (payload: {
    submissionId: string;
    puzzleId: string;
    word: string;
    points: number;
    totalScore: number;
    solvedWords: string[];
    finished: boolean;
  }) => void;
  'scrambled:word:rejected': (payload: {
    submissionId: string;
    code: string;
    message: string;
  }) => void;
  'scrambled:round:ended': (payload: {
    roundNumber: number;
    words: string[];
    results: ScrambledWordsRoomSnapshot['lastRoundResults'];
  }) => void;
  'scrambled:game:ended': (payload: {
    results: ScrambledWordsRoomSnapshot['lastRoundResults'];
    durationMs: number;
  }) => void;
};

export type ScrambledWordsGuestIdentity = {
  guestId: string;
  guestToken: string;
  roomCode?: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
};
