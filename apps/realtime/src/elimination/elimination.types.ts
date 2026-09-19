import type { EliminationRoom, EliminationRoomSnapshot } from '@tahaddi/domain';
import {
  ELIMINATION_MAX_PLAYERS,
  ELIMINATION_SCORING_POLICY_VERSION,
  ELIMINATION_TTL_SECONDS,
} from '@tahaddi/domain';
import {
  createEliminationRoomPayloadSchema,
  eliminationAnswerSubmitPayloadSchema,
  eliminationRoomCodePayloadSchema,
  joinEliminationRoomPayloadSchema,
  type ClientToServerEliminationEvents,
  type CreateEliminationRoomPayload,
  type JoinEliminationRoomPayload,
  type ServerToClientEliminationEvents,
} from '@tahaddi/contracts';

export {
  createEliminationRoomPayloadSchema,
  eliminationAnswerSubmitPayloadSchema,
  eliminationRoomCodePayloadSchema,
  joinEliminationRoomPayloadSchema,
};
export type {
  ClientToServerEliminationEvents,
  CreateEliminationRoomPayload,
  JoinEliminationRoomPayload,
  ServerToClientEliminationEvents,
};

export {
  ELIMINATION_MAX_PLAYERS,
  ELIMINATION_SCORING_POLICY_VERSION,
  ELIMINATION_TTL_SECONDS,
};

export type EliminationRoomRuntime = EliminationRoom & {
  stopReason?: { code: string; message: string };
};

export type EliminationActionResult =
  | { ok: true; room: EliminationRoomRuntime }
  | { ok: false; code: string; message: string };

export type EliminationAnswerSubmitResult =
  | {
      ok: true;
      room: EliminationRoomRuntime;
      accepted: {
        submissionId: string;
        questionId: string;
        optionIndex: number;
      };
    }
  | { ok: false; code: string; message: string; submissionId?: string };

export type EliminationGuestIdentity = {
  guestId: string;
  guestToken: string;
  roomCode?: string;
  name?: string;
  createdAt: number;
  expiresAt: number;
};

export type EliminationSnapshotView = EliminationRoomSnapshot;
