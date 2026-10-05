import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, projectWorld } from './engine';
import { defaultKingdomsConfig, resources } from './config';
import { defaultVillageProgression } from './progression-config';
import type { KingdomsWorld, Troops } from './types';
import { normalizeWorldState } from './world-compatibility';

const start = 1_800_000_000_000;
const originalUnits = new Set(['guard', 'rider', 'scout', 'settler']);
const legacyTroops = { guard: 7, rider: 2, scout: 1, settler: 0 } as Troops;
const expandedTroops = {
  guard: 7,
  rider: 2,
  scout: 1,
  settler: 0,
  archer: 0,
  mounted_archer: 0,
  sultan_guard: 0,
  siege_engineer: 0,
  siege_tower: 0,
};

function legacyWorld(): KingdomsWorld {
  const world = executeCommand(
    createWorld(start),
    'alice',
    { type: 'found', name: 'قرية قديمة' },
    start,
  );
  const village = Object.values(world.villages)[0];
  const saved = Object.fromEntries(
    Object.entries(world).filter(([field]) => !['caravans', 'sieges'].includes(field)),
  );
  return JSON.parse(
    JSON.stringify({
      ...saved,
      config: {
        ...world.config,
        units: Object.fromEntries(
          Object.entries(world.config.units).filter(([key]) => originalUnits.has(key)),
        ),
        progression: {
          ...world.config.progression,
          unitPower: { guard: 123, rider: 21, scout: 4, settler: 2 },
        },
      },
      villages: {
        [village.id]: { ...village, troops: legacyTroops, reinforcements: { home: legacyTroops } },
      },
      movements: [
        {
          id: 'moving',
          ownerId: 'alice',
          sourceId: village.id,
          targetX: 10,
          targetY: 10,
          mission: 'return',
          troops: legacyTroops,
          departedAt: start,
          arrivesAt: start + 7200000,
          travelMs: 7200000,
          loot: resources(11),
        },
      ],
    }),
  ) as KingdomsWorld;
}

describe('persisted Kingdoms world compatibility', () => {
  it('loads a four-unit village with all nine unit counts and finite projection values', () => {
    const saved = legacyWorld();
    const normalized = normalizeWorldState(saved);
    const village = Object.values(normalized.villages)[0];
    expect(village.troops).toEqual(expandedTroops);
    expect(village.reinforcements.home).toEqual(expandedTroops);
    expect(normalized.movements[0].troops).toEqual(expandedTroops);
    expect(normalized.caravans).toEqual([]);
    expect(normalized.sieges).toEqual({});
    expect(normalized.config.units.archer).toEqual(defaultKingdomsConfig.units.archer);
    expect(normalized.config.progression?.unitPower.archer).toBe(
      defaultVillageProgression.unitPower.archer,
    );
    const view = projectWorld(normalized, 'alice', start + 3600000);
    expect(view.villages).toHaveLength(1);
    expect(Number.isFinite(view.villages[0].resources.food)).toBe(true);
    expect(Number.isFinite(view.villages[0].progression?.power.total)).toBe(true);
  });

  it('preserves customized rules, balances, XP, ongoing work and the saved input', () => {
    const saved = legacyWorld();
    const village = Object.values(saved.villages)[0];
    const custom = {
      ...saved,
      config: {
        ...saved.config,
        units: {
          ...saved.config.units,
          guard: { ...saved.config.units.guard, attack: 333 },
          archer: { ...defaultKingdomsConfig.units.archer, upkeep: 7 },
        },
        progression: {
          ...saved.config.progression!,
          unitPower: { ...saved.config.progression!.unitPower, archer: 17 },
        },
      },
      sieges: {
        siege1: {
          id: 'siege1',
          ownerId: 'alice',
          sourceId: village.id,
          targetX: 2,
          targetY: 3,
          troops: legacyTroops,
          stage: 'besieging' as const,
          supply: 42,
          startedAt: start,
          stageStartedAt: start,
          stageDeadline: start + 7200000,
          nextTickAt: start + 7200000,
          wallDamage: 5,
          buildingDamage: { wall: 2 },
        },
      },
      caravans: [
        {
          id: 'caravan1',
          ownerId: 'alice',
          originVillageId: village.id,
          targetVillageId: village.id,
          resources: resources(15),
          departsAt: start,
          arrivesAt: start + 7200000,
          status: 'traveling' as const,
          route: [{ x: 1, y: 2 }],
          exposed: false,
        },
      ],
    };
    const before = structuredClone(custom);
    const normalized = normalizeWorldState(custom);
    expect(normalized.config.units.guard).toEqual(custom.config.units.guard);
    expect(normalized.config.units.archer).toEqual(custom.config.units.archer);
    expect(normalized.config.progression?.unitPower.archer).toBe(17);
    expect(normalized.config.progression?.unitPower.guard).toBe(123);
    expect(normalized.config.progression?.unitPower.rider).toBe(21);
    expect(normalized.villages[village.id].resources).toEqual(village.resources);
    expect(normalized.villages[village.id].progression).toEqual(village.progression);
    expect(normalized.caravans).toEqual(custom.caravans);
    expect(normalized.sieges.siege1).toEqual({ ...custom.sieges.siege1, troops: expandedTroops });
    expect(normalized.movements[0]).toEqual({ ...custom.movements[0], troops: expandedTroops });
    expect(custom).toEqual(before);
    expect(normalized.caravans).not.toBe(custom.caravans);
    expect(normalized.config.units.siege_tower).not.toBe(defaultKingdomsConfig.units.siege_tower);
  });

  it('keeps absent optional progression rules absent and repeated normalization stable', () => {
    const saved = legacyWorld();
    const config = Object.fromEntries(
      Object.entries(saved.config).filter(([field]) => field !== 'progression'),
    ) as KingdomsWorld['config'];
    const normalized = normalizeWorldState({ ...saved, config });
    expect(normalized.config.progression).toBeUndefined();
    expect(normalizeWorldState(normalized)).toEqual(normalized);
  });
});
