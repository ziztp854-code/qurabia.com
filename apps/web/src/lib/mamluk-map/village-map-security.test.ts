import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand, projectWorld } from '../kingdoms/engine';
import { provisionVillageGeography } from './village-geography';
import { ensureVillageGeography } from './village-persistence';

const now = 1_800_000_000_000;

function populatedWorld() {
  const own = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'القاهرة' }, now);
  return executeCommand(own, 'bob', { type: 'found', name: 'قرية الخصم' }, now);
}

function provisioningDatabase(
  row: unknown,
  account: { status: string; tokenVersion: number } | null,
  allowWrite = false,
) {
  const transaction = {
    user: { findUnique: vi.fn(async () => account) },
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      if (/^\s*UPDATE\s+"KingdomWorld"/.test(query.sql)) {
        if (!allowWrite) throw new Error('Unauthorized provisioning attempted a database write');
        return [];
      }
      return row ? [row] : [];
    }),
  };
  return {
    $transaction: async <T>(read: (tx: typeof transaction) => Promise<T>) => read(transaction),
  } as unknown as DatabaseClient;
}

describe('legacy player projection geographic privacy', () => {
  it('never includes the server geography extension in a legacy player response', () => {
    const state = {
      ...populatedWorld(),
      geography: {
        version: 1,
        cities: [{ hiddenGeographicCoordinates: [44.4, 33.3] }],
        armies: [{ classifiedArmy: 'enemy-geographic-secret' }],
        visibility: [{ secretRecipient: 'enemy-vision-secret' }],
      },
    };
    const view = projectWorld(state, 'alice', now);
    const payload = JSON.stringify(view);

    expect(view).not.toHaveProperty('geography');
    expect(payload).not.toContain('hiddenGeographicCoordinates');
    expect(payload).not.toContain('enemy-geographic-secret');
    expect(payload).not.toContain('enemy-vision-secret');
  });

  it('allowlists enemy village metadata without troops, resources or geographic fields', () => {
    const state = populatedWorld();
    const enemy = Object.values(state.villages).find((village) => village.ownerId === 'bob')!;
    const extended = {
      ...state,
      villages: {
        ...state.villages,
        [enemy.id]: {
          ...enemy,
          longitude: 44.4,
          latitude: 33.3,
          confidentialResources: 'enemy-resource-secret',
          confidentialTroops: 'enemy-troop-secret',
        },
      },
    };
    const view = projectWorld(extended, 'alice', now);
    const mapEnemy = view.map.find((village) => village.id === enemy.id)!;

    expect(view.villages.every((village) => village.ownerId === 'alice')).toBe(true);
    expect(mapEnemy).not.toHaveProperty('longitude');
    expect(mapEnemy).not.toHaveProperty('latitude');
    expect(mapEnemy).not.toHaveProperty('resources');
    expect(mapEnemy).not.toHaveProperty('troops');
    expect(JSON.stringify(view)).not.toContain('enemy-resource-secret');
    expect(JSON.stringify(view)).not.toContain('enemy-troop-secret');
  });
});

describe('village provisioning authorization boundary', () => {
  const identity = { id: 'alice', tokenVersion: 0 };
  const row = {
    id: 'security-world', revision: 7, geography: null,
    villages: { v1: { id: 'v1', name: 'القاهرة', ownerId: 'alice', buildings: { wall: 0 } } },
  };

  it('denies a revoked account before writing geographic metadata', async () => {
    const db = provisioningDatabase(row, { status: 'ACTIVE', tokenVersion: 1 });

    await expect(ensureVillageGeography('security-world', identity, db)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('denies an authenticated nonmember before writing geographic metadata', async () => {
    const db = provisioningDatabase(null, { status: 'ACTIVE', tokenVersion: 0 });

    await expect(ensureVillageGeography('security-world', identity, db)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('reports a conflicting world revision rather than returning false success', async () => {
    const db = provisioningDatabase(row, { status: 'ACTIVE', tokenVersion: 0 }, true);

    await expect(ensureVillageGeography('security-world', identity, db)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('geographic village provisioning security', () => {
  it('stores only geographic presentation fields and keeps the entire legacy state intact', () => {
    const original = populatedWorld();
    const before = structuredClone(original);
    const provisioned = provisionVillageGeography('security-world', original);
    const { geography, ...legacy } = provisioned;

    expect(legacy).toEqual(before);
    expect(original).toEqual(before);
    expect(original).not.toHaveProperty('geography');
    expect(geography?.cities).toHaveLength(2);
    for (const record of geography!.cities) {
      expect(Object.keys(record.value).sort()).toEqual([
        'fortificationLevel', 'id', 'latitude', 'longitude', 'name', 'ownerPlayerId',
        'ownerSultanateId', 'regionId', 'strategicValue', 'worldId',
      ]);
      expect(record.value.longitude).toBeGreaterThanOrEqual(-180);
      expect(record.value.longitude).toBeLessThanOrEqual(180);
      expect(record.value.latitude).toBeGreaterThanOrEqual(-90);
      expect(record.value.latitude).toBeLessThanOrEqual(90);
    }
    expect(geography!.armies).toEqual([]);
    expect(geography!.visibility).toEqual([]);
  });

  it('does not relocate persisted villages after ownership or legacy grid changes', () => {
    const original = provisionVillageGeography('security-world', populatedWorld());
    const before = structuredClone(original);
    const changed = {
      ...original,
      villages: Object.fromEntries(Object.entries(original.villages).map(([id, village]) => [
        id, { ...village, x: 900, y: -900, ownerId: 'bob', name: 'اسم جديد' },
      ])),
    };
    const provisioned = provisionVillageGeography('security-world', changed);

    expect(provisioned).toBe(changed);
    expect(provisioned.geography!.cities).toEqual(before.geography!.cities);
    expect(original).toEqual(before);
  });

  it('preserves explicit campaign geography without replacing or enriching its records', () => {
    const state = {
      ...populatedWorld(),
      geography: { version: 1, source: 'explicit-campaign', confidentialExtension: 'keep-me' },
    };
    const before = structuredClone(state);

    expect(provisionVillageGeography('security-world', state)).toBe(state);
    expect(state).toEqual(before);
  });

  it('allocates geographic coordinates independently from the historical grid', () => {
    const state = populatedWorld();
    const shifted = {
      ...state,
      villages: Object.fromEntries(Object.entries(state.villages).map(([id, village]) => [
        id, { ...village, x: 900, y: -900 },
      ])),
    };

    expect(provisionVillageGeography('security-world', shifted).geography).toEqual(
      provisionVillageGeography('security-world', state).geography,
    );
  });

  it('appends new village locations without reordering or moving existing locations', () => {
    const initial = provisionVillageGeography('security-world', populatedWorld());
    const before = structuredClone(initial);
    const village = Object.values(initial.villages)[0]!;
    const newVillages = Object.fromEntries(Array.from({ length: 15 }, (_, index) => {
      const id = `a-new-village-${index}`;
      return [id, { ...village, id }];
    }));
    const grown = provisionVillageGeography('security-world', {
      ...initial,
      villages: { ...initial.villages, ...newVillages },
    });

    expect(grown.geography!.cities).toHaveLength(17);
    expect(grown.geography!.cities.slice(0, 2)).toEqual(before.geography!.cities);
    const locations = grown.geography!.cities.map(({ value }) =>
      `${value.longitude},${value.latitude}`,
    );
    expect(new Set(locations).size).toBe(17);
    expect(initial).toEqual(before);
  });
});
