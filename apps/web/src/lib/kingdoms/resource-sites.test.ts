import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { emptyTroops } from './simulation';
import { gatherPreview } from './resource-sites';
const now = 1800000000000;
it('previews empty armies safely and uses the slowest unit with combined cargo capacity', () => {
  const config = createWorld(now).config;
  expect(gatherPreview(config, { x: 0, y: 0 }, { x: 3, y: 4 }, emptyTroops())).toEqual({
    carry: 0,
    travelMs: 0,
    roundTripMs: 0,
  });
  expect(
    gatherPreview(
      config,
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      {
        ...emptyTroops(),
        guard: 1,
        rider: 1,
      },
    ),
  ).toEqual({ carry: 140, travelMs: 202500, roundTripMs: 405000 });
});
function fixture() {
  const w = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);
  const village = Object.values(w.villages)[0];
  village.troops = { ...emptyTroops(), guard: 20, rider: 4, scout: 2, settler: 1 };
  return { w, villageId: village.id };
}
describe('resource site expeditions', () => {
  it('projects stable nearby finite resource sites for legacy worlds without changing input', () => {
    const { w } = fixture();
    const original = structuredClone(w);
    const view = projectWorld(w, 'alice', now);
    expect(view.resourceSites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 2,
          y: 2,
          resource: 'wood',
          available: 600,
          name: 'غابة الخشب',
        }),
        expect.objectContaining({ x: -4, y: 2, resource: 'food', name: 'حقل القمح' }),
        expect.objectContaining({ x: -4, y: -4, resource: 'iron', name: 'منجم الحديد' }),
      ]),
    );
    expect(projectWorld(w, 'alice', now).resourceSites).toEqual(view.resourceSites);
    expect(w).toEqual(original);
  });
});
it('collects at arrival and credits resources only on return while preserving troops and protection', () => {
  const { w, villageId } = fixture();
  const before = structuredClone(w);
  const troops = { ...emptyTroops(), guard: 3 };
  const outgoing = executeCommand(
    w,
    'alice',
    { type: 'march', villageId, targetX: 2, targetY: 2, mission: 'gather', troops },
    now,
  );
  const movement = outgoing.movements[0];
  expect(outgoing.villages[villageId].troops.guard).toBe(17);
  expect(advanceWorld(outgoing, movement.arrivesAt - 1).movements[0].mission).toBe('gather');
  const arrived = advanceWorld(outgoing, movement.arrivesAt);
  expect(arrived.movements[0]).toMatchObject({ mission: 'return', loot: { wood: 120 } });
  expect(
    projectWorld(arrived, 'alice', arrived.updatedAt).resourceSites?.find(
      (s) => s.x === 2 && s.y === 2,
    )?.available,
  ).toBe(480);
  const dueBack = arrived.movements[0].arrivesAt;
  const returned = advanceWorld(arrived, dueBack);
  expect(returned.movements).toHaveLength(0);
  expect(returned.villages[villageId].troops).toEqual(w.villages[villageId].troops);
  expect(
    returned.villages[villageId].resources.wood -
      advanceWorld(w, dueBack).villages[villageId].resources.wood,
  ).toBeCloseTo(120);
  expect(returned.players.alice.protectionUntil).toBe(w.players.alice.protectionUntil);
  expect(returned.players.alice.score).toBe(w.players.alice.score);
  expect(returned.players.alice.allianceEvent).toBeUndefined();
  expect(advanceWorld(returned, dueBack)).toEqual(returned);
  expect(advanceWorld(outgoing, dueBack)).toEqual(returned);
  expect(w).toEqual(before);
});
it('reserves sites from new settlement and occupation without stranding legacy campaigns', () => {
  const { w, villageId } = fixture();
  for (const mission of ['settle', 'occupy'] as const) {
    expect(() =>
      executeCommand(
        w,
        'alice',
        {
          type: 'march',
          villageId,
          targetX: 2,
          targetY: 2,
          mission,
          troops: { ...emptyTroops(), guard: 5, settler: 1 },
        },
        now,
      ),
    ).toThrow('موقع موارد');
  }
  const legacy = structuredClone(w);
  legacy.movements = [
    {
      id: 'legacy',
      ownerId: 'alice',
      sourceId: villageId,
      targetX: 2,
      targetY: 2,
      mission: 'settle',
      troops: { ...emptyTroops(), settler: 1 },
      departedAt: now,
      arrivesAt: now + 1000,
      travelMs: 1000,
      loot: { wood: 900, stone: 900, iron: 900, food: 700, gold: 100 },
    },
  ];
  const settled = advanceWorld(legacy, now + 1000);
  expect(Object.values(settled.villages).some((v) => v.x === 2 && v.y === 2)).toBe(true);
  expect(
    projectWorld(settled, 'alice', settled.updatedAt).resourceSites?.some(
      (s) => s.x === 2 && s.y === 2,
    ),
  ).toBe(false);
});
it('reports the actual return receipt and storage overflow without crediting twice', () => {
  const { w, villageId } = fixture();
  w.villages[villageId].resources.wood = 2000;
  const sent = executeCommand(
    w,
    'alice',
    {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 3 },
    },
    now,
  );
  const returning = advanceWorld(sent, sent.movements[0].arrivesAt);
  const received = advanceWorld(returning, returning.movements[0].arrivesAt);
  expect(received.villages[villageId].resources.wood).toBe(2000);
  const receipt = received.reports.find((r) => r.title === 'عودة حملة جمع الموارد');
  expect(receipt?.detail).toContain('استلمت 0 خشب');
  expect(receipt?.detail).toContain('120 خشب');
  expect(advanceWorld(received, received.updatedAt).reports).toEqual(received.reports);
});
it('allocates finite stock deterministically between simultaneous expeditions and returns empty armies', () => {
  const { w, villageId } = fixture();
  const send = (state: typeof w) =>
    executeCommand(
      state,
      'alice',
      {
        type: 'march',
        villageId,
        targetX: 2,
        targetY: 2,
        mission: 'gather',
        troops: { ...emptyTroops(), guard: 10 },
      },
      now,
    );
  const sent = send(send(w));
  const arrival = sent.movements[0].arrivesAt;
  const both = advanceWorld(sent, arrival);
  expect(both.movements.map((m) => m.loot.wood)).toEqual([400, 200]);
  expect(
    projectWorld(both, 'alice', arrival).resourceSites?.find((s) => s.x === 2 && s.y === 2)
      ?.available,
  ).toBe(0);
  expect(advanceWorld(both, arrival)).toEqual(both);
  const another = fixture().w;
  another.resourceSiteStocks = { '2,2': { available: 0, updatedAt: now } };
  expect(() => send(another)).toThrow('مستنزف');
  const competing = send(w);
  competing.resourceSiteStocks = {
    '2,2': { available: 0, updatedAt: competing.movements[0].arrivesAt },
  };
  expect(advanceWorld(competing, competing.movements[0].arrivesAt).movements[0].loot.wood).toBe(0);
});
it('regenerates fractional supply by elapsed server time and prunes full stock without minting', () => {
  const { w } = fixture();
  w.resourceSiteStocks = { '2,2': { available: 0, updatedAt: now } };
  expect(
    projectWorld(w, 'alice', now + 18000).resourceSites?.find((s) => s.x === 2 && s.y === 2)
      ?.available,
  ).toBe(0);
  expect(
    projectWorld(w, 'alice', now + 3600000).resourceSites?.find((s) => s.x === 2 && s.y === 2)
      ?.available,
  ).toBe(100);
  const halfway = advanceWorld(w, now + 3600000);
  expect(halfway.resourceSiteStocks?.['2,2'].available).toBe(0);
  const full = advanceWorld(halfway, now + 21600000);
  expect(full.resourceSiteStocks).toEqual({});
  expect(
    projectWorld(full, 'alice', full.updatedAt).resourceSites?.find((s) => s.x === 2 && s.y === 2)
      ?.available,
  ).toBe(600);
  expect(advanceWorld(w, now + 21600000)).toEqual(full);
  const ending = structuredClone(w);
  ending.season.endsAt = now + 3600000;
  expect(
    projectWorld(ending, 'alice', now + 7200000).resourceSites?.find((s) => s.x === 2 && s.y === 2)
      ?.available,
  ).toBe(100);
});
it('rejects invalid, occupied, non-carrying, unauthorized, forged or late expeditions', () => {
  const { w, villageId } = fixture();
  const command = {
    type: 'march' as const,
    villageId,
    targetX: 2,
    targetY: 2,
    mission: 'gather' as const,
    troops: { ...emptyTroops(), guard: 1 },
  };
  for (const troops of [
    emptyTroops(),
    { ...emptyTroops(), scout: 1 },
    { ...emptyTroops(), settler: 1 },
    { ...emptyTroops(), guard: 100 },
  ])
    expect(() => executeCommand(w, 'alice', { ...command, troops }, now)).toThrow();
  expect(() => executeCommand(w, 'outsider', command, now)).toThrow();
  expect(() => executeCommand(w, 'alice', { ...command, targetX: 0 }, now)).toThrow('موقع موارد');
  expect(() => executeCommand(w, 'alice', { ...command, targetX: 1001 }, now)).toThrow();
  expect(() =>
    executeCommand(w, 'alice', { ...command, loot: { wood: 999 } } as never, now),
  ).toThrow();
  const occupied = structuredClone(w);
  occupied.territories['2,2'] = 'alice';
  expect(() => executeCommand(occupied, 'alice', command, now)).toThrow('موقع موارد');
  const late = structuredClone(w);
  late.season.endsAt = now + 1000;
  expect(() => executeCommand(late, 'alice', command, now)).toThrow('وقت الموسم');
});
it('rechecks legacy settlement and occupation races at arrival and returns without harvesting', () => {
  const { w, villageId } = fixture();
  const sent = executeCommand(
    w,
    'alice',
    {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 1 },
    },
    now,
  );
  const claimed = structuredClone(sent);
  claimed.territories['2,2'] = 'another';
  expect(advanceWorld(claimed, claimed.movements[0].arrivesAt).movements[0].loot.wood).toBe(0);
  const built = structuredClone(sent);
  built.villages.legacy = { ...built.villages[villageId], id: 'legacy', x: 2, y: 2 };
  expect(advanceWorld(built, built.movements[0].arrivesAt).movements[0].loot.wood).toBe(0);
});
it('keeps resource discovery bounded and hides occupied sites and other armies', () => {
  const { w, villageId } = fixture();
  const s = executeCommand(w, 'bob', { type: 'found', name: 'مملكة الظل' }, now);
  const other = Object.values(s.villages).find((v) => v.ownerId === 'bob')!;
  other.x = 100;
  other.y = 100;
  const sent = executeCommand(
    s,
    'alice',
    {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 1 },
    },
    now,
  );
  expect(projectWorld(sent, 'bob', now).movements).toEqual([]);
  expect(projectWorld(sent, 'bob', now).incoming).toEqual([]);
  expect(projectWorld(sent, 'outsider', now).resourceSites).toEqual([]);
  expect(
    projectWorld(sent, 'alice', now).resourceSites!.every(
      (site) => Math.abs(site.x + 1) <= 6 && Math.abs(site.y + 1) <= 6,
    ),
  ).toBe(true);
  expect(projectWorld(sent, 'alice', now).resourceSites!.length).toBeLessThanOrEqual(9);
  s.territories['2,2'] = 'bob';
  expect(
    projectWorld(s, 'alice', now).resourceSites?.some((site) => site.x === 2 && site.y === 2),
  ).toBe(false);
});
it('does not deliver gathered resources or troops into a changed-owner source village', () => {
  const { w, villageId } = fixture();
  const sent = executeCommand(
    w,
    'alice',
    {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 1 },
    },
    now,
  );
  const returning = advanceWorld(sent, sent.movements[0].arrivesAt);
  returning.villages[villageId].ownerId = 'bob';
  const army = returning.villages[villageId].troops.guard;
  const ended = advanceWorld(returning, returning.movements[0].arrivesAt);
  expect(ended.villages[villageId].troops.guard).toBe(army);
  expect(ended.movements).toEqual([]);
  expect(
    ended.reports.some(
      (r) =>
        r.title === 'تعذّرت عودة حملة جمع الموارد' &&
        r.recipients.length === 1 &&
        r.recipients[0] === 'alice',
    ),
  ).toBe(true);
});
it('preserves fractional regeneration left after integer harvesting', () => {
  const { w, villageId } = fixture();
  // Keep this fractional-stock regression at its historical arrival time.
  w.config.armyTravelTimeFactor = 1;
  w.resourceSiteStocks = { '2,2': { available: 0, updatedAt: now } };
  const depart = now + 36000;
  const sent = executeCommand(
    w,
    'alice',
    {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 1 },
    },
    depart,
  );
  const arrived = advanceWorld(sent, sent.movements[0].arrivesAt);
  expect(arrived.resourceSiteStocks?.['2,2'].available).toBeGreaterThan(0);
  expect(arrived.resourceSiteStocks?.['2,2'].available).toBeLessThan(1);
  expect(arrived.movements[0].loot.wood).toBe(11);
  const phased = advanceWorld(
    advanceWorld(sent, sent.movements[0].arrivesAt - 1),
    sent.movements[0].arrivesAt,
  );
  expect(phased.resourceSiteStocks).toEqual(arrived.resourceSiteStocks);
  expect(phased.movements).toEqual(arrived.movements);
  expect(phased.villages[villageId].resources.wood).toBeCloseTo(
    arrived.villages[villageId].resources.wood,
  );
});
it('skips resource coordinates when founding new capitals', () => {
  const { w, villageId } = fixture();
  w.config.worldRadius = 5;
  for (let x = -5; x <= 5; x++)
    for (let y = -5; y <= 5; y++) {
      if ((x === -4 && y === -4) || (x === 5 && y === 5)) continue;
      const id = `occupied_${x}_${y}`;
      w.villages[id] = { ...w.villages[villageId], id, x, y };
    }
  const founded = executeCommand(w, 'bob', { type: 'found', name: 'مملكة الظل' }, now);
  expect(Object.values(founded.villages).find((v) => v.ownerId === 'bob')).toMatchObject({
    x: 5,
    y: 5,
  });
});
it('formats fractional near-full storage receipts without exposing floating-point noise', () => {
  const { w, villageId } = fixture();
  w.villages[villageId].resources.wood = 1999.99;
  w.config.baseProduction.wood = 0;
  const sent = executeCommand(
    w,
    'alice',
    {
      type: 'march',
      villageId,
      targetX: 2,
      targetY: 2,
      mission: 'gather',
      troops: { ...emptyTroops(), guard: 3 },
    },
    now,
  );
  const returning = advanceWorld(sent, sent.movements[0].arrivesAt);
  const received = advanceWorld(returning, returning.movements[0].arrivesAt);
  const receipt = received.reports.find((r) => r.title === 'عودة حملة جمع الموارد')!.detail;
  expect(receipt).toContain('استلمت 0.01 خشب');
  expect(receipt).toContain('119.99 خشب');
  expect(receipt).not.toContain('000000');
  expect(received.villages[villageId].resources.wood).toBe(2000);
});
