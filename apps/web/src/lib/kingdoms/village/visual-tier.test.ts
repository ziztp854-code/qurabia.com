import { describe, expect, it } from 'vitest';
import { villageVisualPresentation, villageVisualTierLabels } from './visual-tier';

describe('village visual tier presentation', () => {
  it('maps only the server visualTier without inventing a second calculator', () => {
    expect(villageVisualPresentation(1)).toMatchObject({
      tier: 1,
      label: villageVisualTierLabels[1],
      flagCount: 1,
      wallEmphasis: false,
      marketAmbience: false,
      militaryAmbience: false,
    });
    expect(villageVisualPresentation(3).marketAmbience).toBe(true);
    expect(villageVisualPresentation(4).wallEmphasis).toBe(true);
    expect(villageVisualPresentation(5).militaryAmbience).toBe(true);
    expect(villageVisualPresentation(6)).toMatchObject({
      tier: 6,
      label: 'حاضرة عظيمة',
      flagCount: 4,
    });
  });
  it('clamps unknown or missing server values to the 1–6 presentation range', () => {
    expect(villageVisualPresentation(undefined).tier).toBe(1);
    expect(villageVisualPresentation(0).tier).toBe(1);
    expect(villageVisualPresentation(99).tier).toBe(6);
  });
});
