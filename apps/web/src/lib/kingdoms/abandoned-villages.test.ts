import { describe, expect, it } from 'vitest';
import maskJson from '../../../e2e/fixtures/abandoned-middle-east-geography.json';
import { advanceWorld, createWorld, executeCommand } from './engine';
import { resources } from './config';
import { emptyTroops, total } from './simulation';
import { kingdomsCommandSchema } from './commands';
import { type KingdomsWorld, type Resources } from './types';
import { resourceSiteAt, gatherPreview } from './resource-sites';
import { abandonedPlacementDomain, geographicDistanceKm } from './abandoned-village-geography';
import { withAbandonedPreviewVillages } from './abandoned-village-layout';
import {
  abandonedLayout,
  abandonedLoot,
  abandonedVillageSupply,
  collectAbandonedResources,
  projectAbandonedVillages,
} from './abandoned-villages';

const now = 1800000000000;
const worldId = 'preview_abandoned_unit';
const domain = abandonedPlacementDomain(maskJson);
const players = [
  { longitude: 31.2357, latitude: 30.0444 },
  { longitude: 36.2765, latitude: 33.5138 },
];
function fixture() {
  let world = createWorld(now);
  world = executeCommand(world, 'alice', { type: 'found', name: 'قرية الاختبار' }, now);
  world = executeCommand(world, 'bob', { type: 'found', name: 'القرية الثانية' }, now);
  for (const home of Object.values(world.villages)) {
    home.troops = { ...emptyTroops(), guard: 500, settler: 1 };
    home.resources = resources();
    home.buildings.warehouse = 20;
  }
  world.config.baseProduction = resources();
  world = withAbandonedPreviewVillages(world, worldId, 'unit_seed_20261007', domain, players);
  return {
    world,
    home: Object.values(world.villages)[0]!,
    site: Object.values(world.abandonedVillages!.villages)[0]!,
  };
}
function dispatch(world: KingdomsWorld, actor: string, targetId: string, count = 10) {
  const home = Object.values(world.villages).find((v) => v.ownerId === actor)!;
  return executeCommand(
    world,
    actor,
    {
      type: 'gatherAbandoned',
      villageId: home.id,
      targetId,
      troops: { ...emptyTroops(), guard: count },
    },
    now,
  );
}

describe('persistent abandoned village layout', () => {
  it('places 48 distinct land sites in four regions, with all five ordinary stocks and reserved cells', () => {
    const { world } = fixture();
    const sites = Object.values(world.abandonedVillages!.villages);
    expect(sites).toHaveLength(48);
    expect(new Set(sites.map((s) => s.id)).size).toBe(48);
    expect(new Set(sites.map((s) => `${s.x},${s.y}`)).size).toBe(48);
    for (const region of ['egypt', 'levant', 'iraq', 'arabia'])
      expect(sites.filter((s) => s.region === region)).toHaveLength(12);
    for (const site of sites) {
      expect(site.stock).toEqual(resources(3000, 3000, 3000, 3000, 3000));
      expect(domain.locate(site, site.region)?.clearanceKm).toBeGreaterThanOrEqual(5);
      expect(resourceSiteAt(world.config.worldRadius, site.x, site.y)).toBeNull();
      expect(Object.values(world.villages).some((v) => v.x === site.x && v.y === site.y)).toBe(
        false,
      );
      expect(world.territories[`${site.x},${site.y}`]).toBeUndefined();
      for (const player of players)
        expect(geographicDistanceKm(site, player)).toBeGreaterThanOrEqual(2);
      for (const other of sites.filter((s) => s.id !== site.id))
        expect(geographicDistanceKm(site, other)).toBeGreaterThanOrEqual(20);
    }
  });
  it('keeps saved coordinates, seed and identities after JSON reload and changed generator inputs', () => {
    const { world } = fixture();
    const loaded = JSON.parse(JSON.stringify(world)) as KingdomsWorld;
    const impossible = { ...domain, locate: () => null };
    expect(withAbandonedPreviewVillages(loaded, worldId, 'different_seed', impossible)).toBe(
      loaded,
    );
    expect(loaded.abandonedVillages).toEqual(world.abandonedVillages);
    const another = withAbandonedPreviewVillages(
      createWorld(now),
      'preview_abandoned_other',
      'unit_seed_20261007',
      domain,
    );
    expect(Object.keys(another.abandonedVillages!.villages)).not.toEqual(
      Object.keys(world.abandonedVillages!.villages),
    );
  });
  it('rejects production, mismatched worlds and exhausted placement without modifying input', () => {
    const legacy = createWorld(now),
      before = structuredClone(legacy);
    expect(() =>
      withAbandonedPreviewVillages(legacy, 'kw_production', 'unit_seed', domain),
    ).toThrow();
    expect(() =>
      withAbandonedPreviewVillages(legacy, worldId, 'unit_seed', { ...domain, locate: () => null }),
    ).toThrow();
    expect(legacy).toEqual(before);
    expect(abandonedLayout(legacy)).toBeUndefined();
    expect(() => abandonedLayout(fixture().world, 'preview_abandoned_other')).toThrow();
  });
  it.each([
    [31.2357, 30.0444],
    [36.2765, 33.5138],
    [44.3661, 33.3152],
    [46.6753, 24.7136],
  ])('accepts interior land at %s, %s', (longitude, latitude) => {
    expect(domain.locate({ longitude, latitude })).not.toBeNull();
  });
  it.each([
    [30, 34],
    [36, 23],
    [51, 27],
    [31, 33],
    [51.389, 35.689],
    [32.86, 39.93],
    [NaN, 30],
  ])(
    'excludes seas, outside countries and invalid coordinates at %s, %s',
    (longitude, latitude) => {
      expect(domain.locate({ longitude, latitude })).toBeNull();
    },
  );
  it('excludes an inland lake independently of the land mask', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ] as const;
    const lake = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ] as const;
    const small = abandonedPlacementDomain({
      version: 'test',
      bounds: { west: 0, south: 0, east: 10, north: 10 },
      land: [[square]],
      water: [[lake]],
      countries: [{ code: 'test', region: 'egypt', polygons: [[square]] }],
    });
    expect(small.locate({ longitude: 5, latitude: 5 })).toBeNull();
    expect(small.locate({ longitude: 2, latitude: 2 })).not.toBeNull();
  });
});

describe('shared ordinary resource supply', () => {
  it('regenerates every resource at 100/hour up to 3000, including fractions and season cutoff', () => {
    const { world, site } = fixture();
    site.stock = resources(0, 100, 2990, 2999.5, 10);
    expect(abandonedVillageSupply(world, site, now + 3600000)).toEqual(
      resources(100, 200, 3000, 3000, 110),
    );
    expect(abandonedVillageSupply(world, site, now + 30 * 3600000)).toEqual(
      resources(3000, 3000, 3000, 3000, 3000),
    );
    expect(abandonedVillageSupply(world, site, now - 1000)).toEqual(site.stock);
    world.season.endsAt = now + 18000;
    const loot = collectAbandonedResources(world, site.id, now + 18000, 1);
    expect(total(loot)).toBe(1);
    expect(site.stock.wood).toBe(0.5);
    expect(abandonedVillageSupply(world, site, now + 3600000)).toEqual(site.stock);
  });
  it('divides total army capacity across five resources with deterministic rounding', () => {
    expect(abandonedLoot(resources(3000, 3000, 3000, 3000, 3000), 400)).toEqual(
      resources(80, 80, 80, 80, 80),
    );
    expect(abandonedLoot(resources(3000, 3000, 3000, 3000, 3000), 2)).toEqual(
      resources(1, 1, 0, 0, 0),
    );
    expect(abandonedLoot(resources(0, 0, 0, 0, 2.9), 999)).toEqual(resources(0, 0, 0, 0, 2));
    expect(total(abandonedLoot(resources(3000, 3000, 3000, 3000, 3000), 99999))).toBe(15000);
    expect(() => abandonedLoot(resources(), -1)).toThrow();
    expect(() => abandonedLoot({ ...resources(), paidCoins: 1 } as Resources, 100)).toThrow();
  });
  it('projects only authorized world members and never exposes seed or mutates saved stock', () => {
    const { world, site } = fixture(),
      before = structuredClone(fixture().world);
    const sites = projectAbandonedVillages(world, 'alice', worldId, now);
    expect(sites).toHaveLength(48);
    expect(sites[0]).not.toHaveProperty('stockUpdatedAt');
    expect(sites[0]).not.toHaveProperty('seed');
    expect(world).toEqual(before);
    expect(() => projectAbandonedVillages(world, 'outsider', worldId, now)).toThrow();
    expect(() =>
      projectAbandonedVillages(world, 'alice', 'preview_abandoned_other', now),
    ).toThrow();
    collectAbandonedResources(world, site.id, now, 15000);
    expect(projectAbandonedVillages(world, 'alice', worldId, now)[0]!.available).toEqual(
      resources(),
    );
    expect(projectAbandonedVillages(world, 'alice', worldId, now + 3600000)[0]!.available).toEqual(
      resources(100, 100, 100, 100, 100),
    );
    expect(Object.keys(world.abandonedVillages!.villages)).toHaveLength(48);
  });
});

describe('authoritative abandoned village expeditions', () => {
  it('reserves troops, uses existing grid travel, collects on arrival and credits once on return', () => {
    const { world, home, site } = fixture(),
      before = structuredClone(world);
    const outgoing = dispatch(world, 'alice', site.id);
    const move = outgoing.movements[0]!;
    expect(move.travelMs).toBe(gatherPreview(world.config, home, site, move.troops).travelMs);
    expect(outgoing.villages[home.id]!.troops.guard).toBe(490);
    expect(outgoing.villages[home.id]!.resources.gold).toBe(0);
    expect(outgoing.players.alice!.protectionUntil).toBe(world.players.alice!.protectionUntil);
    const arrived = advanceWorld(outgoing, move.arrivesAt);
    expect(arrived.movements[0]!.loot).toEqual(resources(80, 80, 80, 80, 80));
    expect(arrived.villages[home.id]!.resources.gold).toBe(0);
    expect(arrived.abandonedVillages!.villages[site.id]!.stock).toEqual(
      resources(2920, 2920, 2920, 2920, 2920),
    );
    const returned = advanceWorld(arrived, arrived.movements[0]!.arrivesAt);
    expect(returned.villages[home.id]!.troops.guard).toBe(500);
    expect(returned.villages[home.id]!.resources).toEqual(resources(80, 80, 80, 80, 80));
    expect(advanceWorld(returned, returned.updatedAt)).toEqual(returned);
    expect(world).toEqual(before);
  });
  it('serializes simultaneous arrivals against one finite five-resource inventory', () => {
    const { world, home, site } = fixture();
    let outgoing = dispatch(world, 'alice', site.id, 250);
    outgoing = dispatch(outgoing, 'bob', site.id, 250);
    const at = Math.max(...outgoing.movements.map((m) => m.arrivesAt));
    outgoing.movements.forEach((m) => {
      m.arrivesAt = at;
    });
    const arrived = advanceWorld(outgoing, at);
    expect(arrived.movements.map((m) => total(m.loot))).toEqual([10000, 5000]);
    expect(arrived.abandonedVillages!.villages[site.id]!.stock).toEqual(resources());
    expect(arrived.villages[home.id]!.resources.gold).toBe(0);
    expect(advanceWorld(arrived, at)).toEqual(arrived);
  });
  it('rejects unknown targets, foreign armies, paid stock, client coordinates, conquest and season overflow', () => {
    const { world, home, site } = fixture();
    expect(() => dispatch(world, 'alice', 'av_unknown')).toThrow();
    expect(() =>
      executeCommand(
        world,
        'bob',
        {
          type: 'gatherAbandoned',
          villageId: home.id,
          targetId: site.id,
          troops: { ...emptyTroops(), guard: 1 },
        },
        now,
      ),
    ).toThrow();
    expect(
      kingdomsCommandSchema.safeParse({
        type: 'gatherAbandoned',
        villageId: home.id,
        targetId: site.id,
        troops: emptyTroops(),
        targetX: site.x,
      }).success,
    ).toBe(false);
    for (const mission of ['settle', 'occupy', 'attack', 'raid', 'scout'] as const) {
      expect(() =>
        executeCommand(
          world,
          'alice',
          {
            type: 'march',
            villageId: home.id,
            targetX: site.x,
            targetY: site.y,
            mission,
            troops: { ...emptyTroops(), guard: 10, settler: 1, scout: 1 },
          },
          now,
        ),
      ).toThrow();
    }
    world.season.endsAt = now + 1000;
    expect(() => dispatch(world, 'alice', site.id)).toThrow();
  });
  it('does not credit another owner after origin ownership changes, and honors storage capacity', () => {
    const { world, home, site } = fixture();
    const outgoing = dispatch(world, 'alice', site.id);
    const arrived = advanceWorld(outgoing, outgoing.movements[0]!.arrivesAt);
    arrived.villages[home.id]!.ownerId = 'bob';
    const returned = advanceWorld(arrived, arrived.movements[0]!.arrivesAt);
    expect(returned.villages[home.id]!.resources).toEqual(resources());
    const full = dispatch(world, 'alice', site.id);
    full.villages[home.id]!.buildings.warehouse = 0;
    full.villages[home.id]!.resources = resources(2000, 2000, 2000, 2000, 2000);
    const back = advanceWorld(full, full.movements[0]!.arrivesAt + full.movements[0]!.travelMs);
    expect(back.villages[home.id]!.resources).toEqual(resources(2000, 2000, 2000, 2000, 2000));
    expect(back.reports.some((r) => r.detail?.includes('فائض'))).toBe(true);
  });
});
