import { describe, expect, it } from 'vitest';
import { defaultKingdomsConfig, kingdomsConfigSchema } from './config';

describe('Kingdoms village vision configuration', () => {
  it('accepts the default sparse building bonuses', () => {
    expect(
      kingdomsConfigSchema.parse(defaultKingdomsConfig).vision?.visionRadiusByBuilding,
    ).toEqual({ wall: 4, stable: 3 });
  });
  it.each([{ unknown: 1 }, { wall: -1 }])('rejects invalid vision bonuses %j', (bonuses) => {
    expect(
      kingdomsConfigSchema.safeParse({
        ...defaultKingdomsConfig,
        vision: { ...defaultKingdomsConfig.vision, visionRadiusByBuilding: bonuses },
      }).success,
    ).toBe(false);
  });
});
