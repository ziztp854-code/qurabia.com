import { describe, expect, it } from 'vitest';
import type { Feature, MapPayload } from '@mamluk/world-map-core';
import { findSelection, listSelectableFeatures } from './selection';

const city: Feature = {
  type: 'Feature',
  id: 'cairo',
  geometry: { type: 'Point', coordinates: [31.2357, 30.0444] },
  properties: {
    kind: 'city',
    name: 'القاهرة',
    regionId: 'egypt',
    ownerPlayerId: 'viewer',
    ownerSultanateId: 'mamluk',
    fortificationLevel: 4,
    strategicValue: 90,
  },
};
function payload(features: readonly Feature[] = [city]): MapPayload {
  const empty = { type: 'FeatureCollection' as const, features: [] };
  return {
    schemaVersion: 1,
    worldId: 'world',
    revision: '1',
    serverTime: 2000,
    expiresAt: 10000,
    bounds: { west: 20, south: 20, east: 40, north: 40 },
    layers: {
      cities: { ...empty, features },
      castles: empty,
      armies: empty,
      armyRoutes: empty,
      territories: empty,
      sultanateBorders: empty,
      sieges: empty,
      visibility: empty,
      fog: empty,
    },
  };
}

describe('approved map selection', () => {
  it('presents a city only from its approved properties and real coordinates', () => {
    const selected = findSelection(payload(), { layer: 'cities', id: 'cairo' }, 'viewer');
    expect(selected?.title).toBe('القاهرة');
    expect(selected?.details).toContainEqual({ label: 'التحصين', value: '٤' });
    expect(selected?.coordinates).toBe('31.2357 / 30.0444');
    expect(JSON.stringify(selected)).not.toContain('mamluk');
  });
  it('removes a selection when an updated authorized payload no longer contains it', () => {
    expect(findSelection(payload([]), { layer: 'cities', id: 'cairo' }, 'viewer')).toBeNull();
    expect(findSelection(null, { layer: 'cities', id: 'cairo' }, 'viewer')).toBeNull();
  });
  it('never presents routes or unexpected fields for an enemy army', () => {
    const base = payload([]);
    const enemy: Feature = {
      ...city,
      id: 'enemy',
      properties: {
        armyId: 'enemy',
        ownerPlayerId: 'enemy-owner',
        ownerSultanateId: null,
        status: 'moving',
        own: false,
        secretTroopCount: 99999,
      },
    };
    const snapshot: MapPayload = {
      ...base,
      layers: {
        ...base.layers,
        armies: { type: 'FeatureCollection', features: [enemy] },
        armyRoutes: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'enemy',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [31, 30],
                  [35, 33],
                ],
              },
              properties: {
                armyId: 'enemy',
                distance: 12345,
                departureTime: 1000,
                arrivalTime: 9000,
              },
            },
          ],
        },
      },
    };
    const selected = findSelection(snapshot, { layer: 'armies', id: 'enemy' }, 'viewer');
    expect(selected?.title).toBe('جيش مرصود');
    expect(JSON.stringify(selected)).not.toMatch(/99999|12345|enemy-owner|المسافة|الوصول/);
  });
  it('offers keyboard selection only for entities in the approved viewport', () => {
    expect(listSelectableFeatures(payload())).toEqual([
      { layer: 'cities', id: 'cairo', label: 'القاهرة' },
    ]);
    expect(listSelectableFeatures(null)).toEqual([]);
  });

  it('shows own route distance and server arrival while preserving neutral-city and castle labels', () => {
    const base = payload([]);
    const own: Feature = {
      ...city,
      id: 'own',
      properties: {
        armyId: 'own',
        ownerPlayerId: 'viewer',
        ownerSultanateId: null,
        status: 'stationed',
        own: true,
      },
    };
    const snapshot: MapPayload = {
      ...base,
      layers: {
        ...base.layers,
        armies: { type: 'FeatureCollection', features: [own] },
        castles: {
          type: 'FeatureCollection',
          features: [
            {
              ...city,
              id: 'castle',
              properties: {
                ...city.properties,
                kind: 'castle',
                name: 'قلعة القاهرة',
                ownerPlayerId: null,
              },
            },
          ],
        },
        armyRoutes: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              id: 'own',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [31, 30],
                  [32, 31],
                ],
              },
              properties: {
                armyId: 'own',
                distance: 10000,
                departureTime: 2000,
                arrivalTime: 9000,
              },
            },
          ],
        },
        sieges: {
          type: 'FeatureCollection',
          features: [
            {
              ...city,
              id: 'siege',
              properties: { targetId: 'castle', targetKind: 'castle', status: 'active' },
            },
          ],
        },
      },
    };
    expect(
      findSelection(snapshot, { layer: 'armies', id: 'own' }, 'viewer')?.details,
    ).toContainEqual({ label: 'المسافة', value: '١٠ كم' });
    const tileSnapshot = {
      ...snapshot,
      layers: {
        ...snapshot.layers,
        armyRoutes: {
          ...snapshot.layers.armyRoutes,
          features: snapshot.layers.armyRoutes.features.map((feature) => ({
            ...feature,
            properties: { ...feature.properties, distance: 5, distanceUnit: 'tiles' },
          })),
        },
      },
    };
    expect(
      findSelection(tileSnapshot, { layer: 'armies', id: 'own' }, 'viewer')?.details,
    ).toContainEqual({ label: 'المسافة', value: '٥ خانة' });
    expect(
      findSelection(snapshot, { layer: 'castles', id: 'castle' }, 'viewer')?.details,
    ).toContainEqual({ label: 'الملكية', value: 'مستقلة' });
    expect(findSelection(snapshot, { layer: 'sieges', id: 'siege' }, 'viewer')?.title).toBe(
      'حصار قلعة',
    );
    expect(findSelection(snapshot, null, 'viewer')).toBeNull();
  });
});
