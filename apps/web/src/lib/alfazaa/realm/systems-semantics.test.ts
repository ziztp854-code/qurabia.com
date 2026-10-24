import { describe, it, expect } from 'vitest';
import { getQuestViews } from './systems-quests';
import { createSystemsState } from './systems-core';
import type { GameplayContext } from './common';
const now = 1800000000000;
const context: GameplayContext = {
  now,
  balances: {},
  view: {
    castleLevel: 100,
    playerLevel: 1,
    cells: Array(36).fill(null),
    heroes: [{ id: 62003, level: 1, stars: 1, skills: [62003001], skillLevels: [1] }],
    campaignCompleted: [],
    research: {},
    lifetime: {},
    daily: {},
  },
  bonuses: { attack: 0, defense: 0, health: 0, production: 0, training: 0 },
};
describe('quest semantic regression predicates', () => {
  it('uses actual skill levels and requires a learned slot beyond born skill', () => {
    const state = createSystemsState(now),
      views = getQuestViews(state, context);
    expect(views.find((v) => v.family === 'plot' && v.id === 403)?.progress).toBe(1);
    expect(views.find((v) => v.family === 'road' && v.id === 202)?.progress).toBe(0);
  });
  it('adapts swapped source road unit fields to the actual9troops atlevel20 objective', () => {
    const state = createSystemsState(now),
      ctx = {
        ...context,
        view: {
          ...context.view,
          cells: [
            ...Array.from({ length: 9 }, () => ({ kind: 'troop' as const, cfgId: 10020 })),
            ...Array(27).fill(null),
          ],
        },
      };
    const view = getQuestViews(state, ctx, 'road').find((v) => v.id === 303);
    expect(view?.progress).toBe(9);
    expect(view?.goal).toBe(9);
    expect(view?.sourceGoal).toBe(20);
  });
});
