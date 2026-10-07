import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand, projectWorld } from './engine';
import {
  ABANDONED_ROLLOUT_WORLD_ID,
  ABANDONED_ROLLOUT_WORLD_NAME,
  prepareCurrentWorldAbandoned,
} from './abandoned-village-rollout';
import { resources } from './config';
import { emptyTroops } from './simulation';
import { abandonedVillageSupply } from './abandoned-villages';
const now = 1800000000000;
function fixture() {
  let state = createWorld(now);
  state = executeCommand(state, 'alice', { type: 'found', name: 'قرية الاختبار' }, now);
  const home = Object.values(state.villages)[0]!;
  home.troops = { ...emptyTroops(), guard: 10 };
  home.resources = resources();
  const row = {
    id: ABANDONED_ROLLOUT_WORLD_ID,
    name: ABANDONED_ROLLOUT_WORLD_NAME,
    revision: 17,
    paused: false,
    state,
  };
  return { row, home };
}
describe('current world abandoned rollout', () => {
  it('adds only the registry; distributes four regions and excludes player and queued cells', () => {
    const { row, home } = fixture();
    row.state.movements.push({
      id: 'reserved',
      ownerId: 'alice',
      sourceId: home.id,
      targetX: 80,
      targetY: 80,
      mission: 'settle',
      troops: emptyTroops(),
      loot: resources(),
      departedAt: now,
      arrivesAt: now + 1000,
      travelMs: 1000,
    });
    const before = structuredClone(row),
      plan = prepareCurrentWorldAbandoned(row, now + 12345);
    expect(row).toEqual(before);
    expect(plan.summary.regions).toEqual({ egypt: 12, levant: 12, iraq: 12, arabia: 12 });
    expect(plan.summary.minimumPlayerDistanceKm).toBeGreaterThanOrEqual(2);
    expect(plan.summary.minimumCoastClearanceKm).toBeGreaterThanOrEqual(5);
    expect(plan.summary.minimumNpcDistanceKm).toBeGreaterThanOrEqual(20);
    expect(Object.values(plan.layout.villages).some((site) => site.x === 80 && site.y === 80)).toBe(
      false,
    );
    expect(plan.layout.scope).toBe('kingdom-world');
    expect(plan.layout.generatedAt).toBe(now + 12345);
    expect(plan.summary.movementDestinationsExcluded).toBe(1);
  });
  it('never resets saved stocks or positions when repeated', () => {
    const { row } = fixture();
    const first = prepareCurrentWorldAbandoned(row, now);
    row.state.abandonedVillages = first.layout;
    const site = Object.values(first.layout.villages)[0]!;
    site.stock = resources(7, 8, 9, 10, 11);
    const before = structuredClone(row);
    const again = prepareCurrentWorldAbandoned(row, now + 5000);
    expect(again.changed).toBe(false);
    expect(again.layout).toBe(first.layout);
    expect(row).toEqual(before);
  });
  it('rejects other worlds, changed names, paused and ended seasons', () => {
    const { row } = fixture();
    for (const change of [{ id: 'kw_new_world' }, { name: 'آخر' }, { paused: true }])
      expect(() => prepareCurrentWorldAbandoned({ ...row, ...change }, now)).toThrow();
    expect(() => prepareCurrentWorldAbandoned(row, row.state.season.endsAt)).toThrow();
  });
  it('projects real-world NPC data only to members and collects through the real engine', () => {
    const { row, home } = fixture();
    row.state.abandonedVillages = prepareCurrentWorldAbandoned(row, now).layout;
    const site = Object.values(row.state.abandonedVillages.villages)[0]!;
    const view = projectWorld(row.state, 'alice', now);
    expect(view.abandonedVillages).toHaveLength(48);
    expect(view.abandonedVillages![0]).not.toHaveProperty('stockUpdatedAt');
    expect(projectWorld(row.state, 'outsider', now).abandonedVillages).toEqual([]);
    const sent = executeCommand(
      row.state,
      'alice',
      {
        type: 'gatherAbandoned',
        villageId: home.id,
        targetId: site.id,
        troops: { ...emptyTroops(), guard: 10 },
      },
      now,
    );
    expect(sent.movements[0]!.abandonedGather?.worldId).toBe(row.id);
    expect(abandonedVillageSupply(row.state, site, now)).toEqual(
      resources(3000, 3000, 3000, 3000, 3000),
    );
  });
});
