import {
  createLadderRoomPayloadSchema as sharedSchema,
  joinLadderRoomPayloadSchema as sharedJoin,
  startLadderGamePayloadSchema as sharedStart,
} from '@tahaddi/contracts';
import { LADDER_MAX_TEAM_PLAYERS } from '@tahaddi/domain';
import {
  createLadderRoomPayloadSchema as serverSchema,
  joinLadderRoomPayloadSchema as serverJoin,
  startLadderGamePayloadSchema as serverStart,
} from '../ladder.types.js';

describe('ladder room contract', () => {
  it.each([sharedSchema, serverSchema])(
    'accepts only the supported game settings',
    (schema) => {
      expect(schema.parse({})).toEqual({
        totalRounds: 10,
        winningPosition: 10,
      });
      expect(schema.safeParse({ totalRounds: 20 }).success).toBe(false);
      expect(schema.safeParse({ winningPosition: 5 }).success).toBe(false);
      expect(schema.safeParse({ questionTimeLimit: 45 }).success).toBe(true);
    },
  );

  it.each([sharedJoin, serverJoin, sharedStart, serverStart])(
    'negotiates only the supported intro version',
    (schema) => {
      const payload = {
        roomCode: 'AB12CD34',
        ...(schema === sharedJoin || schema === serverJoin
          ? { playerName: 'متسابق' }
          : {}),
      };
      expect(schema.safeParse(payload).success).toBe(true);
      expect(schema.safeParse({ ...payload, introVersion: 1 }).success).toBe(
        true,
      );
      expect(schema.safeParse({ ...payload, introVersion: 2 }).success).toBe(
        false,
      );
      expect(
        schema.safeParse({ ...payload, introVersion: 1, introDuration: 1 })
          .success,
      ).toBe(false);
    },
  );

  it('limits each side to one player', () => {
    expect(LADDER_MAX_TEAM_PLAYERS).toBe(1);
  });
});
