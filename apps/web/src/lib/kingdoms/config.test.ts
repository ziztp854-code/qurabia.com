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

describe('Army travel review policy configuration', () => {
  it.each([0.45, 1])('accepts the reviewed and historical time factor %s', (armyTravelTimeFactor) => {
    expect(kingdomsConfigSchema.parse({ ...defaultKingdomsConfig, armyTravelTimeFactor })
      .armyTravelTimeFactor).toBe(armyTravelTimeFactor);
  });
  it.each([0, -1, 1.01, NaN, Infinity])('rejects an invalid factor %s', (armyTravelTimeFactor) => {
    expect(kingdomsConfigSchema.safeParse({ ...defaultKingdomsConfig, armyTravelTimeFactor })
      .success).toBe(false);
  });
  it('still accepts a persisted configuration that predates the factor', () => {
    const legacy = structuredClone(defaultKingdomsConfig);
    delete legacy.armyTravelTimeFactor;
    expect(kingdomsConfigSchema.parse(legacy).armyTravelTimeFactor).toBeUndefined();
  });
});
