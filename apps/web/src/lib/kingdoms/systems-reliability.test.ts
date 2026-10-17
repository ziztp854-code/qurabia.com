import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand } from './engine';
import { resources } from './config';
import { canInterceptCaravan, emptyTroops, storageCapacity } from './simulation';
const now = 1_800_000_000_000;
function fixture() {
  let world = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'النور' }, now);
  world = executeCommand(world, 'bob', { type: 'found', name: 'الفجر' }, now);
  world.config.baseProduction = resources();
  const [source, target] = Object.values(world.villages);
  source.buildings.market = 1;
  source.buildings.lumber = 1;
  source.resources = resources(500, 500, 500, 500, 100);
  target.resources = resources();
  target.troops = { ...emptyTroops(), guard: 100 };
  world.caravans = [
    {
      id: 'cv-audit',
      ownerId: 'alice',
      originVillageId: source.id,
      targetVillageId: target.id,
      resources: resources(10),
      departsAt: now,
      arrivesAt: now + 10000,
      status: 'traveling',
      exposed: true,
      route: [
        { x: source.x, y: source.y },
        { x: target.x, y: target.y },
      ],
    },
  ];
  return { world, source, target };
}
describe('mission rewards conserve resources', () => {
  it('keeps a reward claim, score and XP available until the full reward fits', () => {
    const { world, source } = fixture();
    source.resources.food = storageCapacity(world.config, source);
    const before = structuredClone(world);
    expect(() =>
      executeCommand(world, 'alice', { type: 'claim', mission: 'builder' }, now),
    ).toThrow(/سعة/);
    expect(world).toEqual(before);
    source.resources.food -= world.config.questReward.food;
    const claimed = executeCommand(world, 'alice', { type: 'claim', mission: 'builder' }, now);
    expect(claimed.players.alice.claims).toContain('builder');
    expect(claimed.players.alice.score).toBe(world.config.questScore);
    expect(claimed.villages[source.id].resources.food).toBe(storageCapacity(world.config, source));
    expect(claimed.villages[source.id].resources.gold).toBe(
      source.resources.gold + world.config.questReward.gold,
    );
    expect(claimed.reports.filter((r) => r.event?.key === 'quest.claimed')).toMatchObject([
      {
        at: now,
        recipients: ['alice'],
        event: { sourceId: 'builder', resources: { received: world.config.questReward } },
      },
    ]);
    expect(() =>
      executeCommand(claimed, 'alice', { type: 'claim', mission: 'builder' }, now),
    ).toThrow();
  });
});
describe('caravan deadlines use the same season clock as the economy', () => {
  it('does not deliver a legacy caravan after the season simulation has stopped', () => {
    const { world, target } = fixture();
    world.season.endsAt = now + 5000;
    const ended = advanceWorld(world, now + 20000);
    expect(ended.season.status).toBe('ended');
    expect(ended.villages[target.id].resources).toEqual(resources());
    expect(ended.caravans[0].status).toBe('traveling');
    expect(advanceWorld(ended, now + 30000)).toEqual(ended);
  });
  it('delivers exactly once when arrival coincides with season end', () => {
    const { world, target } = fixture();
    world.season.endsAt = world.caravans[0].arrivesAt;
    const ended = advanceWorld(world, now + 20000);
    expect(ended.villages[target.id].resources.wood).toBe(10);
    expect(ended.reports.filter((r) => r.event?.key === 'caravan.arrived')).toHaveLength(1);
    expect(advanceWorld(ended, now + 30000)).toEqual(ended);
  });
  it('rejects a new caravan that cannot arrive before the season closes without spending', () => {
    const { world, source, target } = fixture();
    world.season.endsAt = now + 500;
    const before = structuredClone(world);
    expect(() =>
      executeCommand(
        world,
        'alice',
        {
          type: 'caravanSend',
          villageId: source.id,
          targetVillageId: target.id,
          resources: resources(50),
        },
        now,
      ),
    ).toThrow(/الموسم/);
    expect(world).toEqual(before);
  });
  it('rejects an unrepresentable travel deadline without charging resources', () => {
    const { world, source, target } = fixture();
    world.config.secondsPerTile = Number.MAX_VALUE;
    expect(() =>
      executeCommand(
        world,
        'alice',
        {
          type: 'caravanSend',
          villageId: source.id,
          targetVillageId: target.id,
          resources: resources(50),
        },
        now,
      ),
    ).toThrow();
    expect(source.resources.wood).toBe(500);
  });
});
describe('caravan interception availability', () => {
  it('uses simulated world time rather than the machine clock', () => {
    const { world } = fixture();
    expect(canInterceptCaravan(world, world.caravans[0].id)).toBe(true);
  });
  it.each(['hidden', 'not-departed', 'own'] as const)('rejects an %s caravan', (mode) => {
    const { world, source, target } = fixture();
    const caravan = world.caravans[0];
    if (mode === 'hidden') caravan.exposed = false;
    if (mode === 'not-departed') caravan.departsAt = now + 1000;
    if (mode === 'own') {
      target.ownerId = 'alice';
      source.troops = { ...emptyTroops(), guard: 100 };
    }
    expect(() =>
      executeCommand(
        world,
        mode === 'own' ? 'alice' : 'bob',
        {
          type: 'caravanIntercept',
          carrierId: caravan.id,
          villageId: mode === 'own' ? source.id : target.id,
          troops: { ...emptyTroops(), guard: 100 },
        },
        now,
      ),
    ).toThrow();
    expect(world.caravans[0].resources.wood).toBe(10);
  });
});
