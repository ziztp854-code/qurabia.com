import type {
  ChessColor,
  ChessResultReason,
  ChessRoom,
  ChessRoomSnapshot,
  TimeControlPreset,
} from '@tahaddi/domain';
import { z } from 'zod';

const chessNameSchema = z.string().trim().min(2).max(30);
export const chessPinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

export const createChessRoomPayloadSchema = z
  .object({
    playerName: chessNameSchema,
    timeControl: z.enum(['none', '3+2', '5+0', '10+0', '15+10']).default('5+0'),
    colorChoice: z.enum(['random', 'white', 'black']).default('random'),
  })
  .strict();

export const joinChessRoomPayloadSchema = z
  .object({
    pin: chessPinSchema,
    playerName: chessNameSchema,
  })
  .strict();

export const spectateChessRoomPayloadSchema = z
  .object({
    pin: chessPinSchema,
    spectatorName: chessNameSchema.optional(),
  })
  .strict();

export type ChessRoomPlayerSeat = {
  guestId: string;
  displayName: string;
  color: ChessColor;
  connected: boolean;
  disconnectAt?: number;
};

export type ChessRoomPlayer = {
  guestId: string;
  displayName: string;
  color: ChessColor;
};

export type CreateRoomInput = z.output<typeof createChessRoomPayloadSchema> & {
  timeControl: TimeControlPreset;
};

export type JoinRoomInput = z.output<typeof joinChessRoomPayloadSchema>;

export type SpectateInput = z.output<typeof spectateChessRoomPayloadSchema> & {
  spectatorId?: string;
};

export type ActionResult =
  { ok: true; room: ChessRoom } | { ok: false; code: string; message: string };

export type MoveResult =
  | {
      ok: true;
      san: string;
      newFen: string;
      newStateVersion: number;
      isCheck: boolean;
      isCheckmate: boolean;
      isStalemate: boolean;
      isDraw: boolean;
      legalSquares?: string[];
      gameEnd?: {
        reason: ChessResultReason;
        winner: 'white' | 'black' | 'draw';
      };
    }
  | {
      ok: false;
      code: string;
      message: string;
      currentStateVersion?: number;
      latestFen?: string;
    };

export const CHESS_ROOM_TTL_SECONDS = 3 * 60 * 60;
export const CHESS_ROOM_LOCK_MILLISECONDS = 10_000;
export const CHESS_GUEST_TTL_SECONDS = 24 * 60 * 60;
export const CHESS_GRACE_SECONDS = 60;
export const CHESS_MAX_SPECTATORS = 100;

type CreateRoomPayload = z.input<typeof createChessRoomPayloadSchema>;
type JoinRoomPayload = z.input<typeof joinChessRoomPayloadSchema>;
type SpectateRoomPayload = z.input<typeof spectateChessRoomPayloadSchema>;

export type ClientToServerChessEvents = {
  'chess:room:create': (payload: CreateRoomPayload) => void;
  'chess:room:join': (payload: JoinRoomPayload) => void;
  'chess:reconnect': (payload: { pin?: string; guestId?: string }) => void;
  'chess:sync': (payload: { pin?: string }) => void;
  'chess:spectate': (payload: SpectateRoomPayload) => void;
  'chess:player:ready': (payload: { pin?: string }) => void;
  'chess:move': (payload: {
    pin?: string;
    from?: string;
    to?: string;
    promotion?: string;
    expectedVersion?: number;
  }) => void;
  'chess:resign': (payload: { pin?: string }) => void;
  'chess:draw:offer': (payload: { pin?: string }) => void;
  'chess:draw:respond': (payload: { pin?: string; accept?: boolean }) => void;
  'chess:leave': (payload: { pin?: string }) => void;
};

export type ServerToClientChessEvents = {
  'chess:room:state': (payload: ChessRoomSnapshot) => void;
  'chess:error': (payload: { code: string; message: string }) => void;
  'chess:move:ack': (payload: {
    san: string;
    from: string;
    to: string;
    promotion?: string;
    newFen: string;
    newStateVersion: number;
    isCheck: boolean;
    isCheckmate: boolean;
    isStalemate: boolean;
    isDraw: boolean;
    legalSquares?: string[];
    gameEnd?: { reason: ChessResultReason; winner: 'white' | 'black' | 'draw' };
  }) => void;
  'chess:move:rejected': (payload: {
    code: string;
    message: string;
    currentStateVersion: number;
    latestFen: string;
  }) => void;
  'chess:opponent:disconnect': (payload: {
    gracePeriodSeconds: number;
  }) => void;
  'chess:opponent:reconnect': () => void;
  'chess:game:end': (payload: {
    reason: ChessResultReason;
    winner: 'white' | 'black' | 'draw';
    durationMs: number;
    moveCount: number;
  }) => void;
  'chess:draw:offered': (payload: { by: ChessColor; at: number }) => void;
  'chess:draw:result': (payload: { accepted: boolean }) => void;
  'chess:countdown': (payload: { remaining: number }) => void;
};
