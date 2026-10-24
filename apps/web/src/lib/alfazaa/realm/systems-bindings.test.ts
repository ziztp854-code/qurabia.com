import { describe, it, expect } from 'vitest';
import { createSystemsState } from './systems-core';
import { getQuestViews, getQuestBindingCoverage } from './systems-quests';
import type { GameplayContext } from './common';
const now = 1800000000000;
const ctx: GameplayContext = {
  now,
  balances: {},
  view: {
    castleLevel: 1,
    playerLevel: 1,
    cells: Array(36).fill(null),
    heroes: [],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
};
describe('source quest binding contract', () => {
  it('binds every imported namespaced condition and exposes every adaptation with its source description', () => {
    const state = createSystemsState(now),
      coverage = getQuestBindingCoverage(state, ctx);
    expect(coverage.map((c) => [c.family, c.total, c.unavailable])).toEqual([
      ['main', 968, 0],
      ['road', 35, 0],
      ['plot', 63, 0],
      ['daily', 591, 0],
      ['milestone', 16, 0],
    ]);
    const views = getQuestViews(state, ctx);
    expect(views).toHaveLength(1673);
    for (const view of views) {
      expect(Number.isSafeInteger(view.progress)).toBe(true);
      expect(view.progress).toBeGreaterThanOrEqual(0);
      if (view.adaptation) {
        expect(view.description).toContain(view.adaptation);
        expect(view).toHaveProperty('sourceDescription');
      }
    }
    expect(views.filter((v) => v.family === 'daily').every((v) => v.status === 'locked')).toBe(
      true,
    );
  });
});
