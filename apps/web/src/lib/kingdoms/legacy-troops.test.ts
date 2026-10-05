import { describe, expect, it } from 'vitest';
import { kingdomsCommandSchema } from './commands';
import { commanderCombatPower, createCommander } from './commanders';
import { createWorld, executeCommand } from './engine';
import { resources } from './config';
import { deployedTroops, foodUpkeep } from './simulation';
import type { KingdomsConfig, Troops } from './types';

const legacyTroops = { guard: 10, rider: 2, scout: 1, settler: 0 } as Troops;
const addedUnits = [
  'archer',
  'mounted_archer',
  'sultan_guard',
  'siege_engineer',
  'siege_tower',
] as const;
const march = {
  type: 'march',
  villageId: 'v1',
  targetX: 2,
  targetY: 3,
  mission: 'attack',
  troops: legacyTroops,
};
const start = 1_800_000_000_000;

function worldWithLegacyUnits() {
  const world = executeCommand(
    createWorld(start),
    'alice',
    { type: 'found', name: 'قرية قديمة' },
    start,
  );
  const units = Object.fromEntries(
    Object.entries(world.config.units).filter(
      ([key]) => !addedUnits.includes(key as (typeof addedUnits)[number]),
    ),
  );
  return { ...world, config: { ...world.config, units } as KingdomsConfig };
}

describe('legacy troop command compatibility', () => {
  it.each([
    march,
    { type: 'caravanIntercept', carrierId: 'carrier1', villageId: 'v1', troops: legacyTroops },
  ])('accepts old four-unit requests and defaults only added units in $type', (command) => {
    const parsed = kingdomsCommandSchema.parse(command);
    expect('troops' in parsed && parsed.troops).toEqual({
      guard: 10,
      rider: 2,
      scout: 1,
      settler: 0,
      archer: 0,
      mounted_archer: 0,
      sultan_guard: 0,
      siege_engineer: 0,
      siege_tower: 0,
    });
  });
  it.each(['guard', 'rider', 'scout', 'settler'])('still requires original %s count', (unit) => {
    const troops = Object.fromEntries(Object.entries(legacyTroops).filter(([key]) => key !== unit));
    expect(kingdomsCommandSchema.safeParse({ ...march, troops }).success).toBe(false);
  });
  it.each(addedUnits)('validates explicit %s counts and retains accepted counts', (unit) => {
    for (const value of [-1, 1.5, 1000001, '1', null]) {
      expect(
        kingdomsCommandSchema.safeParse({ ...march, troops: { ...legacyTroops, [unit]: value } })
          .success,
      ).toBe(false);
    }
    expect(
      kingdomsCommandSchema.parse({ ...march, troops: { ...legacyTroops, [unit]: 1000000 } }),
    ).toMatchObject({ troops: { [unit]: 1000000 } });
  });
  it('rejects unknown troop fields', () => {
    expect(
      kingdomsCommandSchema.safeParse({ ...march, troops: { ...legacyTroops, unknown: 1 } })
        .success,
    ).toBe(false);
  });
});

describe('legacy troop calculations', () => {
  it('calculates finite upkeep with old troop records and stored unit specifications', () => {
    const world = worldWithLegacyUnits();
    const village = { ...Object.values(world.villages)[0], troops: legacyTroops };
    expect(foodUpkeep(world.config, village, legacyTroops)).toBe(34);
  });
  it('aggregates movements and stationed reinforcements without missing-unit NaN values', () => {
    const world = worldWithLegacyUnits();
    const village = Object.values(world.villages)[0];
    const saved = {
      ...world,
      villages: { [village.id]: { ...village, reinforcements: { home: legacyTroops } } },
      movements: [
        {
          id: 'moving',
          ownerId: 'alice',
          sourceId: 'home',
          targetX: 2,
          targetY: 3,
          mission: 'return' as const,
          troops: legacyTroops,
          departedAt: start,
          arrivesAt: start + 7200000,
          travelMs: 7200000,
          loot: resources(),
        },
      ],
    };
    expect(deployedTroops(saved).get('home')).toEqual({
      guard: 20,
      rider: 4,
      scout: 2,
      settler: 0,
      archer: 0,
      mounted_archer: 0,
      sultan_guard: 0,
      siege_engineer: 0,
      siege_tower: 0,
    });
  });
  it('calculates legacy combat power with and without commander bonuses', () => {
    const world = worldWithLegacyUnits();
    expect(commanderCombatPower(world, legacyTroops, 'attack')).toBe(494);
    const commander = { ...createCommander(world, 'c1', 'alice', 'قائد', 'defense'), defense: 10 };
    expect(commanderCombatPower(world, legacyTroops, 'defense', commander)).toBeCloseTo(657.8);
  });
});
