import { describe, it, expect } from 'vitest';
import { createInitialState } from '../domain';
import { createSharedWorld } from './world-engine';
import { syncWorldEvents } from './world-events';
describe('atomic world quest events', () => {
  it('credits received resources once and records donation count separately from its gold amount', () => {
    const now = 1800000000000;
    const world = createSharedWorld(now);
    const city = createInitialState(now);
    world.progress.alice = {
      victories: 0,
      gathered: 12,
      gatheredResources: { wood: 10.5, iron: 1.5 },
    };
    const first = syncWorldEvents(world, 'alice', city, now, {
      type: 'alliance-donate',
      amount: 50,
    });
    expect(first.city.realm.systems.lifetime['guild-donate']).toBe(1);
    expect(first.city.realm.systems.lifetime['guild-donated-gold']).toBe(50);
    expect(first.city.realm.systems.lifetime['resource-gather:470001']).toBe(1);
    const second = syncWorldEvents(first.world, 'alice', first.city, now);
    expect(second.city).toBe(first.city);
    expect(second.city.realm.systems.lifetime['resource-gather:450001']).toBe(10);
  });
});
