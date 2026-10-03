import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { buildingKeys } from './types';

const now = 1_800_000_000_000;
const found = () =>
  executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);

describe('Village authoritative progression', () => {
  it('retains the power cache signature when JSONB reorders nested object keys', () => {
    const world = advanceWorld(found(), now);
    const id = Object.keys(world.villages)[0];
    const reordered = JSON.parse(
      JSON.stringify(world, (_key, value: unknown) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => b.localeCompare(a)))
          : value,
      ),
    );
    expect(advanceWorld(reordered, now).villages[id].progression!.signature).toBe(
      world.villages[id].progression!.signature,
    );
  });
  it('allocates strategic power identically when JSON object keys are reordered', () => {
    const world = found();
    const first = Object.values(world.villages)[0];
    const second = { ...structuredClone(first), id: 'z_second', x: first.x + 2 };
    delete first.progression;
    delete second.progression;
    world.territories['20,20'] = 'alice';
    world.villages = { [first.id]: first, [second.id]: second };
    const reordered = { ...world, villages: { [second.id]: second, [first.id]: first } };
    expect(advanceWorld(reordered, now).villages).toEqual(advanceWorld(world, now).villages);
  });
  it('derives mature legacy villages deterministically without resetting them to level one', () => {
    const world = found();
    const village = Object.values(world.villages)[0];
    village.buildings = Object.fromEntries(
      buildingKeys.map((key) => [key, 20]),
    ) as typeof village.buildings;
    delete village.progression;
    const restored = JSON.parse(JSON.stringify(world));
    const advanced = advanceWorld(restored, now);
    const progress = advanced.villages[village.id].progression!;
    expect(progress.level).toBe(50);
    expect(progress.nextLevelXp).toBeNull();
    expect(progress.rank).toBe('حاضرة مملوكية');
    expect(progress.visualTier).toBe(6);
    expect(advanceWorld(JSON.parse(JSON.stringify(advanced)), now)).toEqual(advanced);
    expect(world.villages[village.id].progression).toBeUndefined();
  });
  it('awards completed construction and training once, never on reservation or retry', () => {
    let world = found();
    const id = Object.keys(world.villages)[0];
    world.villages[id].buildings.barracks = 1;
    world = advanceWorld(world, now);
    const before = world.villages[id].progression!.xp;
    world = executeCommand(
      world,
      'alice',
      { type: 'build', villageId: id, building: 'lumber' },
      now,
    );
    world = executeCommand(
      world,
      'alice',
      { type: 'train', villageId: id, unit: 'guard', count: 2 },
      now,
    );
    expect(world.villages[id].progression!.xp).toBe(before);
    const completed = advanceWorld(world, now + 60_000);
    expect(completed.villages[id].progression!.xp).toBe(before + 110);
    expect(completed.villages[id].progression!.power.military).toBe(16);
    expect(advanceWorld(completed, now + 60_000)).toEqual(completed);
  });
  it('requires infrastructure at milestone levels even when XP is sufficient', () => {
    const world = advanceWorld(found(), now);
    const village = Object.values(world.villages)[0];
    village.progression = { ...village.progression!, xp: 1_000_000, signature: '' };
    const progress = projectWorld(world, 'alice', now).villages[0].progression!;
    expect(progress.level).toBe(9);
    expect(progress.requirements).toEqual([
      { building: 'hall', required: 3, actual: 1 },
      { building: 'warehouse', required: 2, actual: 0 },
    ]);
  });
  it('awards development achievements only on the first successful claim', () => {
    const world = found();
    const id = Object.keys(world.villages)[0];
    world.villages[id].buildings.lumber = 1;
    delete world.villages[id].progression;
    const before = advanceWorld(world, now);
    const claimed = executeCommand(before, 'alice', { type: 'claim', mission: 'builder' }, now);
    expect(projectWorld(claimed, 'alice', now).villages[0].progression!.xp).toBe(350);
    expect(() =>
      executeCommand(claimed, 'alice', { type: 'claim', mission: 'builder' }, now),
    ).toThrow();
    expect(advanceWorld(claimed, now).villages[id].progression!.xp).toBe(350);
  });
  it('awards new strategic territory once and never for an already owned tile', () => {
    let world = found();
    const village = Object.values(world.villages)[0];
    village.troops.guard = 10;
    delete village.progression;
    const intent = {
      type: 'march',
      villageId: village.id,
      mission: 'occupy',
      targetX: village.x + 1,
      targetY: village.y,
      troops: { guard: 10, rider: 0, scout: 0, settler: 0 },
    } as const;
    world = executeCommand(world, 'alice', intent, now);
    const arrival = world.movements[0].arrivesAt;
    world = advanceWorld(world, arrival);
    expect(world.villages[village.id].progression!.xp).toBe(150);
    expect(world.villages[village.id].progression!.power.strategic).toBe(100);
    world = advanceWorld(world, arrival + world.movements[0].travelMs);
    world = executeCommand(world, 'alice', intent, world.updatedAt);
    expect(
      advanceWorld(world, world.movements[0].arrivesAt).villages[village.id].progression!.xp,
    ).toBe(150);
  });
  it('accepts old configs without progression and preserves existing completed assets', () => {
    const world = found();
    delete world.config.progression;
    const progress = projectWorld(JSON.parse(JSON.stringify(world)), 'alice', now).villages[0]
      .progression!;
    expect(progress.level).toBe(1);
    expect(progress.xp).toBe(0);
    expect(progress.power.total).toBe(50);
  });
  it('does not farm XP or power from resource accumulation or transferred stock', () => {
    const world = advanceWorld(found(), now);
    const id = Object.keys(world.villages)[0];
    const before = world.villages[id].progression;
    const later = advanceWorld(world, now + 3_600_000);
    expect(later.villages[id].resources.wood).toBe(980);
    expect(later.villages[id].progression).toEqual(before);
  });
  it('counts deployed home troops once and excludes allied garrisons', () => {
    const world = found();
    const village = Object.values(world.villages)[0];
    village.troops.guard = 10;
    const home = advanceWorld(world, now);
    const moving = executeCommand(
      home,
      'alice',
      {
        type: 'march',
        villageId: village.id,
        mission: 'occupy',
        targetX: village.x + 1,
        targetY: village.y,
        troops: { guard: 10, rider: 0, scout: 0, settler: 0 },
      },
      now,
    );
    moving.villages[village.id].reinforcements.other = {
      guard: 100,
      rider: 0,
      scout: 0,
      settler: 0,
    };
    const progress = projectWorld(moving, 'alice', now).villages[0].progression!;
    expect(progress.power.military).toBe(80);
    expect(progress.xp).toBe(home.villages[village.id].progression!.xp);
  });
  it.each(['villagePower', 'villageLevel', 'xp', 'progression'])(
    'rejects forged %s in client intents',
    (field) => {
      const world = found();
      expect(() =>
        executeCommand(
          world,
          'alice',
          {
            type: 'build',
            villageId: Object.keys(world.villages)[0],
            building: 'lumber',
            [field]: 999,
          } as Parameters<typeof executeCommand>[2],
          now,
        ),
      ).toThrow();
    },
  );
});
