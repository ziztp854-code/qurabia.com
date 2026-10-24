import { describe, it, expect } from 'vitest';
import { createInitialState } from '../domain';
import { createSharedWorld, applySharedCommand } from './world-engine';
import { syncCitySupport } from './world-support';
describe('trusted city support', () => {
  it('derives a bounded infantry commander from actual city progress without adding troops', () => {
    const now = 1800000000000;
    const city = createInitialState(now);
    const world = applySharedCommand(
      createSharedWorld(now),
      'alice',
      { type: 'join', name: 'النور' },
      now,
    );
    const next = syncCitySupport(world, 'alice', city);
    const village = Object.values(next.game.villages)[0];
    const commander = next.game.commanders![village.commanderId!];
    expect(commander.name).toBe('إسناد أبطال المدينة');
    expect(commander.attack).toBeGreaterThan(0);
    expect(commander.attack).toBeLessThanOrEqual(30);
    expect(Object.values(village.troops).reduce((a, b) => a + b, 0)).toBe(0);
    expect(world.game.villages[village.id].commanderId).toBeUndefined();
    expect(syncCitySupport(world, 'bob', city)).toBe(world);
    const maximal = syncCitySupport(next, 'alice', { ...city, castleLevel: 100 });
    expect(maximal.game.commanders![village.commanderId!].attack).toBe(30);
    const marching = structuredClone(maximal);
    marching.game.commanders![village.commanderId!].status = 'marching';
    expect(syncCitySupport(marching, 'alice', city)).toBe(marching);
  });
});
