import { describe, expect, it } from 'vitest';
import { createWorld } from './engine';
import { captureSiegeTransitions } from './reports-siege';
import { publicReport } from './report-events';
import { emptyTroops } from './simulation';
describe('report-only siege lifecycle observer', () => {
  it('records owner-only stages, aggregates damage, and never records a damage tick', () => {
    const old = createWorld(1000);
    const current = structuredClone(old);
    current.sieges.s1 = {
      id: 's1',
      ownerId: 'owner',
      sourceId: 'v1',
      targetX: 2,
      targetY: 4,
      troops: emptyTroops(),
      stage: 'approaching',
      supply: 5,
      startedAt: 1000,
      stageStartedAt: 1000,
      stageDeadline: 2000,
      nextTickAt: 1500,
      wallDamage: 1,
      buildingDamage: {},
    };
    captureSiegeTransitions(old, current);
    expect(current.reports).toHaveLength(1);
    expect(publicReport(current.reports[0], 'enemy')).toBeNull();
    const next = structuredClone(current);
    next.sieges.s1.wallDamage = 2;
    captureSiegeTransitions(current, next);
    expect(next.reports).toHaveLength(1);
    next.sieges.s1.stage = 'assaulting';
    next.sieges.s1.stageStartedAt = 2000;
    next.updatedAt = 2000;
    captureSiegeTransitions(current, next);
    expect(next.reports).toHaveLength(2);
    expect(next.reports[1].event?.siege?.wallDamage).toBe(2);
    const closed = structuredClone(next);
    delete closed.sieges.s1;
    captureSiegeTransitions(next, closed);
    expect(closed.reports.at(-1)?.event?.key).toBe('siege.closed');
    expect(closed.sieges).toEqual({});
  });
});
