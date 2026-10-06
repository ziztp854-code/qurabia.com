import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, nextEventAt, projectWorld } from './engine';
import { resources } from './config';
import { emptyTroops, projectEnemySightings } from './simulation';
const now = 1_800_000_000_000;
function fixture() {
  let w = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'Alice' }, now);
  w = executeCommand(w, 'bob', { type: 'found', name: 'Bob' }, now);
  const [a, b] = Object.values(w.villages);
  a.buildings.market = 1;
  a.resources = resources(500);
  b.resources = resources(100);
  a.troops = { ...emptyTroops(), guard: 100 };
  b.troops = { ...emptyTroops(), guard: 100 };
  return { w, a, b };
}
describe('caravan conservation', () => {
  it('delivers resources to a different player exactly once', () => {
    const { w, a, b } = fixture();
    const sent = executeCommand(w, 'alice', { type: 'caravanSend', villageId: a.id, targetVillageId: b.id, resources: resources(10) }, now);
    expect(sent.villages[a.id].resources.wood).toBe(490);
    const arrival = sent.caravans[0].arrivesAt;
    const control = advanceWorld({ ...sent, caravans: [] }, arrival);
    const arrived = advanceWorld(sent, arrival);
    expect(arrived.villages[b.id].resources.wood).toBeCloseTo(control.villages[b.id].resources.wood + 10);
    expect(arrived.caravans[0].resources).toEqual(resources(0));
    expect(advanceWorld(arrived, arrival)).toEqual(arrived);
    expect(nextEventAt(sent)).toBe(arrival);
  });
  it('refunds a canceled traveling caravan once', () => {
    const { w, a, b } = fixture();
    const sent = executeCommand(w, 'alice', { type: 'caravanSend', villageId: a.id, targetVillageId: b.id, resources: resources(10) }, now);
    const canceled = executeCommand(sent, 'alice', { type: 'caravanCancel', caravanId: sent.caravans[0].id }, now);
    expect(canceled.villages[a.id].resources).toEqual(a.resources);
    expect(advanceWorld(canceled, sent.caravans[0].arrivesAt).caravans).toEqual([]);
    expect(() => executeCommand(canceled, 'alice', { type: 'caravanCancel', caravanId: sent.caravans[0].id }, now)).toThrow();
    expect(() => executeCommand(sent, 'bob', { type: 'caravanCancel', caravanId: sent.caravans[0].id }, now)).toThrow();
  });
  it.each([1, 100])('preserves interception troops for a force of %i', (count) => {
    const { w, a, b } = fixture();
    const sent = executeCommand(w, 'alice', { type: 'caravanSend', villageId: a.id, targetVillageId: b.id, resources: resources(10) }, now);
    const intercepted = executeCommand(sent, 'bob', { type: 'caravanIntercept', carrierId: sent.caravans[0].id, villageId: b.id, troops: { ...emptyTroops(), guard: count } }, now);
    expect(intercepted.villages[b.id].troops).toEqual(b.troops);
    expect(intercepted.caravans[0].status).toBe(count === 1 ? 'traveling' : 'intercepted');
    const expected = count === 1 ? 100 : 110;
    expect(intercepted.villages[b.id].resources.wood).toBe(expected);
  });
});
describe('enemy sighting privacy', () => {
  function attackFixture() {
    const { w, a, b } = fixture();
    a.x = 0; a.y = 0; b.x = 100; b.y = 0;
    w.movements = [{ id: 'hostile', ownerId: 'bob', sourceId: b.id, targetX: a.x, targetY: a.y, mission: 'attack', troops: { ...emptyTroops(), guard: 99 }, commanderId: 'secret-commander', departedAt: now, arrivesAt: now + 100000, travelMs: 100000, loot: resources(0) }];
    return { w, a, b };
  }
  it('does not reveal a distant army just because its destination is the viewer', () => {
    const { w } = attackFixture();
    const view = projectWorld(w, 'alice', now);
    expect(view.incoming).toHaveLength(1);
    expect(view.enemySightings).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('secret-commander');
    expect(JSON.stringify(view)).not.toContain('"guard":99');
  });
  it('redacts troops and commander even when an army enters vision', () => {
    const { w } = attackFixture();
    const view = projectWorld(w, 'alice', now + 99000);
    expect(view.enemySightings).toHaveLength(1);
    expect(Object.keys(view.enemySightings[0]).sort()).toEqual(['expiresAt', 'id', 'seenAt', 'villageId']);
    expect(JSON.stringify(view)).not.toContain('secret-commander');
    expect(JSON.stringify(view)).not.toContain('"guard":99');
  });
  it('uses the moving army position and vision from every owned village', () => {
    const { w, a } = attackFixture();
    w.villages.second = { ...structuredClone(a), id: 'second', x: 50, y: 0 };
    expect(projectEnemySightings(w, 'alice', now + 50000)).toHaveLength(1);
    expect(projectEnemySightings(w, 'alice', now + 25000)).toEqual([]);
    expect(projectEnemySightings(w, 'spectator', now + 99000)).toEqual([]);
  });
});
