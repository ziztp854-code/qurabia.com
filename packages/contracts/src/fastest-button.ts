import { z } from 'zod';
export const fastestCodeSchema = z.string().regex(/^\d{6}$/);
export const fastestSettingsSchema = z
  .object({
    mode: z.enum(['classic', 'elimination', 'points']).default('classic'),
    totalRounds: z.number().int().min(1).max(30).default(5),
    responseSeconds: z.number().int().min(3).max(60).default(10),
    countdownSeconds: z.number().int().min(2).max(10).default(3),
  })
  .strict();
export const fastestJoinSchema = z
  .object({ code: fastestCodeSchema, name: z.string().trim().min(2).max(30) })
  .strict();
export const fastestCodePayloadSchema = z.object({ code: fastestCodeSchema }).strict();
export const fastestPressSchema = z
  .object({ code: fastestCodeSchema, roundId: z.string().uuid() })
  .strict();
export const fastestCommandSchema = z
  .object({
    code: fastestCodeSchema,
    action: z.enum(['start', 'stop', 'reset', 'configure', 'remove']),
    playerId: z.string().uuid().optional(),
    settings: fastestSettingsSchema.optional(),
  })
  .strict();
export type FastestButtonMode = 'classic' | 'elimination' | 'points';
export type FastestButtonSettings = z.output<typeof fastestSettingsSchema>;
export type FastestButtonRound = {
  id: string;
  number: number;
  isTiebreak: boolean;
  isFinal: boolean;
  eligibleIds: string[];
  startAt: number;
  endAt: number;
  presses: { playerId: string; sequence: number; receivedAt: number }[];
  winnerId: string | null;
  cancelled: boolean;
  closedAt: number | null;
  eliminatedIds: string[];
  awards: { playerId: string; points: number; rank: number | null }[];
};
export type FastestButtonSnapshot = {
  code: string;
  revision: number;
  serverNow: number;
  settings: FastestButtonSettings;
  phase: 'lobby' | 'countdown' | 'active' | 'results' | 'finished';
  players: {
    id: string;
    name: string;
    score: number;
    eliminated: boolean;
    removed: boolean;
    connected: boolean;
  }[];
  round: FastestButtonRound | null;
  rounds: FastestButtonRound[];
  championId: string | null;
  tiebreakIds: string[];
  regularCompleted: number;
  notice: string | null;
};
export type FastestButtonIdentity = { code: string; playerId: string; token: string };
export type FastestButtonError = { code: string; message: string };
