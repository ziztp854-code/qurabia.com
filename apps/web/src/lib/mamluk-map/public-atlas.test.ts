import { describe, expect, it } from 'vitest';
import { WorldMapService, type WorldMapReadSession } from '@mamluk/world-map-core/server';
import { PUBLIC_ATLAS_WORLD, PublicAtlasRepository } from './public-atlas';

const now = 1800000000000;
const middleEast = { west: 25, south: 15, east: 50, north: 40 };
const viewer = { playerId: 'authenticated-user' };
const atlas = () => new PublicAtlasRepository(viewer.playerId, () => now);

describe('public geographic reference atlas', () => {
  it('projects only twelve public landmarks through the existing visibility pipeline', async () => {
    const payload = await new WorldMapService(atlas()).getViewport(
      { worldId: PUBLIC_ATLAS_WORLD.id, bounds: middleEast },
      viewer,
    );
    expect(payload.layers.cities.features).toHaveLength(12);
    expect(
      payload.layers.cities.features.find((city) => city.id === 'cairo')?.geometry.coordinates,
    ).toEqual([31.24967, 30.06263]);
    for (const city of payload.layers.cities.features) {
      expect(city.properties.ownerPlayerId).toBeNull();
      expect(city.properties.ownerSultanateId).toBeNull();
      expect(city.properties.fortificationLevel).toBe(0);
      expect(city.properties.strategicValue).toBe(0);
    }
    for (const layer of [
      'castles',
      'territories',
      'sultanateBorders',
      'armies',
      'armyRoutes',
      'sieges',
    ] as const)
      expect(payload.layers[layer].features).toHaveLength(0);
    expect(payload.layers.fog.features).toHaveLength(0);
    expect(payload.expiresAt).toBe(now + 15000);
    const serialized = JSON.stringify(payload);
    for (const secret of [
      'enemy-hidden',
      'enemy-visible',
      'cairo-guard',
      'departureTime',
      'arrivalTime',
      'mamluk-campaign-border',
    ])
      expect(serialized).not.toContain(secret);
  });

  it('queries only landmarks within the viewport, including empty dateline bounds', async () => {
    const service = new WorldMapService(atlas());
    const cairo = await service.getViewport(
      {
        worldId: PUBLIC_ATLAS_WORLD.id,
        bounds: { west: 31.2, south: 30, east: 31.3, north: 30.1 },
      },
      viewer,
    );
    expect(cairo.layers.cities.features.map((city) => city.id)).toEqual(['cairo']);
    const dateline = await service.getViewport(
      {
        worldId: PUBLIC_ATLAS_WORLD.id,
        bounds: { west: 170, south: -10, east: -170, north: 10 },
      },
      viewer,
    );
    expect(dateline.layers.cities.features).toHaveLength(0);
  });

  it('rejects unknown/private world IDs and a different recipient rather than falling back', async () => {
    await expect(
      atlas().withSnapshot('private-world', viewer, async () => null),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      atlas().withSnapshot(PUBLIC_ATLAS_WORLD.id, { playerId: 'foreign-user' }, async () => null),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('binds a recipient-scoped reference grant and closes the read session', async () => {
    let escaped: WorldMapReadSession | undefined;
    await atlas().withSnapshot(PUBLIC_ATLAS_WORLD.id, viewer, async (session) => {
      escaped = session;
      const vision = await session.getVisibilityInBounds({ bounds: middleEast, limit: 100 });
      expect(vision.regions).toHaveLength(1);
      expect(vision.regions[0]).toMatchObject({
        worldId: PUBLIC_ATLAS_WORLD.id,
        recipientPlayerId: viewer.playerId,
        startsAt: now,
        expiresAt: now + 15000,
      });
      expect(vision.visibleTerritoryIds).toEqual([]);
      expect(vision.visibleSultanateTerritoryIds).toEqual([]);
      await expect(session.getCitiesInBounds({ bounds: middleEast, limit: 0 })).rejects.toThrow();
      expect(await session.getCitiesInBounds({ bounds: middleEast, limit: 2 })).toHaveLength(2);
    });
    await expect(escaped!.getCitiesInBounds({ bounds: middleEast, limit: 100 })).rejects.toThrow(
      'ended',
    );
  });
  it('validates reference-reader inputs and closes the session after a failed projection', async () => {
    expect(() => new PublicAtlasRepository('')).toThrow();
    await expect(
      new PublicAtlasRepository(viewer.playerId, () => -1).withSnapshot(
        PUBLIC_ATLAS_WORLD.id,
        viewer,
        async () => null,
      ),
    ).rejects.toThrow();
    let escaped: WorldMapReadSession | undefined;
    await expect(
      atlas().withSnapshot(PUBLIC_ATLAS_WORLD.id, viewer, async (session) => {
        escaped = session;
        for (const limit of [NaN, 0, 10002]) {
          await expect(session.getCitiesInBounds({ bounds: middleEast, limit })).rejects.toThrow();
        }
        await expect(
          session.getCitiesInBounds({ bounds: { ...middleEast, west: 181 }, limit: 100 }),
        ).rejects.toThrow();
        throw new Error('Projection failed');
      }),
    ).rejects.toThrow('Projection failed');
    await expect(
      escaped!.getVisibilityInBounds({ bounds: middleEast, limit: 100 }),
    ).rejects.toThrow('ended');
  });
});
