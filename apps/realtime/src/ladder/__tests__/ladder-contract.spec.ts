import { createLadderRoomPayloadSchema as sharedSchema } from '@tahaddi/contracts';
import { LADDER_MAX_TEAM_PLAYERS } from '@tahaddi/domain';
import { createLadderRoomPayloadSchema as serverSchema } from '../ladder.types.js';

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

  it('limits each side to one player', () => {
    expect(LADDER_MAX_TEAM_PLAYERS).toBe(1);
  });
});
