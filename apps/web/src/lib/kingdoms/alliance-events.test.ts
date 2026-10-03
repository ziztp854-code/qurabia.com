import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { resources } from './config';
const now = 1_800_000_000_000;
describe('weekly alliance events', () => {
  it('rotates themes on season-aligned weeks and expires at the season boundary', () => {
    const world = createWorld(now);
    expect(projectWorld(world, 'outsider', now).allianceEvent).toMatchObject({ eventKey: 's1-w0', theme: 'build', points: 0, canClaim: false });
    expect(projectWorld(world, 'outsider', now + 604800000).allianceEvent).toMatchObject({ eventKey: 's1-w1', theme: 'train' });
    expect(projectWorld(world, 'outsider', now + 1209600000).allianceEvent).toMatchObject({ theme: 'trade' });
    expect(projectWorld(world, 'outsider', world.season.endsAt - 1).allianceEvent?.endsAt).toBe(world.season.endsAt);
    expect(projectWorld(world, 'outsider', world.season.endsAt).allianceEvent).toBeNull();
  });
});
function fixture() {
  let w = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);
  w = executeCommand(w, 'bob', { type: 'found', name: 'مملكة الظل' }, now);
  for (const v of Object.values(w.villages)) { v.buildings.embassy = 1; v.buildings.barracks = 1; v.buildings.market = 1; }
  w = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
  const allianceId = w.players.alice.allianceId!;
  w = executeCommand(w, 'bob', { type: 'allianceJoin', allianceId }, now);
  w = executeCommand(w, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
  return { w, a: Object.values(w.villages).find(v => v.ownerId === 'alice')!.id, b: Object.values(w.villages).find(v => v.ownerId === 'bob')!.id, allianceId };
}
it('credits completed construction only once, preserves input, and caps each contributor', () => {
  const { w, a } = fixture();
  let next = executeCommand(w, 'alice', { type: 'build', villageId: a, building: 'lumber' }, now);
  expect(projectWorld(next, 'alice', now).allianceEvent?.ownPoints).toBe(0);
  next = advanceWorld(next, next.villages[a].build!.endsAt);
  expect(projectWorld(next, 'alice', next.updatedAt).allianceEvent?.ownPoints).toBe(5);
  expect(w.players.alice.allianceEvent).toBeUndefined();
  expect(projectWorld(advanceWorld(next, next.updatedAt), 'alice', next.updatedAt).allianceEvent?.ownPoints).toBe(5);
  for (const building of ['quarry', 'mine', 'farm', 'wall'] as const) {
    next = executeCommand(next, 'alice', { type: 'build', villageId: a, building }, next.updatedAt);
    next = advanceWorld(next, next.villages[a].build!.endsAt);
  }
  expect(projectWorld(next, 'alice', next.updatedAt).allianceEvent?.ownPoints).toBe(20);
});

it('pays each contributing member once, rejects wrong keys and overflow without consuming claims', () => {
  const { w, a, b, allianceId } = fixture();
  for (const id of ['alice', 'bob']) w.players[id].allianceEvent = { eventKey: 's1-w0', allianceId, points: 20, claimed: false, tradedWith: [] };
  const command = { type: 'allianceEventClaim' as const, villageId: a, eventKey: 's1-w0' };
  expect(() => executeCommand(w, 'alice', { ...command, eventKey: 's1-w1' }, now)).toThrow();
  expect(() => executeCommand(w, 'alice', { ...command, villageId: b }, now)).toThrow();
  w.villages[a].resources.wood = 2000;
  expect(() => executeCommand(w, 'alice', command, now)).toThrow('المخزن');
  expect(projectWorld(w, 'alice', now).allianceEvent?.canClaim).toBe(true);
  w.villages[a].resources.wood = 900;
  const next = executeCommand(w, 'alice', command, now);
  expect(next.villages[a].resources.wood).toBe(1000);
  expect(next.players.alice.score).toBe(w.players.alice.score);
  expect(projectWorld(next, 'alice', now).allianceEvent?.claimed).toBe(true);
  expect(() => executeCommand(next, 'alice', command, now)).toThrow();
  expect(executeCommand(next, 'bob', { ...command, villageId: b }, now).players.bob.allianceEvent?.claimed).toBe(true);
});
it('counts actual unique qualifying trades for both partners and ignores tiny or canceled offers', () => {
  const { w, a, b } = fixture();
  const at = now + 1209600000;
  let s = executeCommand(w, 'alice', { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 100) }, at);
  const offered = s.offers[0].id;
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(0);
  s = executeCommand(s, 'bob', { type: 'tradeAccept', villageId: b, offerId: offered }, at);
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(5);
  expect(projectWorld(s, 'bob', at).allianceEvent?.ownPoints).toBe(5);
  s = executeCommand(s, 'alice', { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 100) }, at);
  s = executeCommand(s, 'bob', { type: 'tradeAccept', villageId: b, offerId: s.offers[0].id }, at);
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(5);
  s = executeCommand(s, 'carol', { type: 'found', name: 'مملكة الفجر' }, at);
  const c = Object.values(s.villages).find(v => v.ownerId === 'carol')!.id;
  s.villages[c].buildings.market = 1;
  s = executeCommand(s, 'alice', { type: 'tradeOffer', villageId: a, give: resources(1), want: resources(0, 100) }, at);
  s = executeCommand(s, 'carol', { type: 'tradeAccept', villageId: c, offerId: s.offers[0].id }, at);
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(5);
  s = executeCommand(s, 'alice', { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 100) }, at);
  s = executeCommand(s, 'alice', { type: 'tradeCancel', offerId: s.offers[0].id }, at);
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(5);
  s = executeCommand(s, 'alice', { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 100) }, at);
  s = executeCommand(s, 'carol', { type: 'tradeAccept', villageId: c, offerId: s.offers[0].id }, at);
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(10);
  expect(projectWorld(s, 'carol', at).allianceEvent?.ownPoints).toBe(0);
});

it('credits training only on its active theme, lazily resets the week, and ignores legacy queues', () => {
  const { w, a, allianceId } = fixture();
  let s = executeCommand(w, 'alice', { type: 'train', villageId: a, unit: 'guard', count: 1 }, now);
  s = advanceWorld(s, s.villages[a].training!.endsAt);
  expect(projectWorld(s, 'alice', s.updatedAt).allianceEvent?.ownPoints).toBe(0);
  s.players.alice.allianceEvent = { eventKey: 's1-w0', allianceId, points: 20, claimed: true, tradedWith: [] };
  const at = now + 604800000;
  s = executeCommand(s, 'alice', { type: 'train', villageId: a, unit: 'guard', count: 25 }, at);
  s = advanceWorld(s, s.villages[a].training!.endsAt);
  expect(projectWorld(s, 'alice', s.updatedAt).allianceEvent).toMatchObject({ ownPoints: 20, claimed: false });
  s.villages[a].training = { unit: 'guard', count: 1, endsAt: s.updatedAt + 1000 };
  const old = structuredClone(s);
  delete old.players.alice.allianceEvent;
  expect(projectWorld(old, 'alice', old.villages[a].training!.endsAt).allianceEvent?.ownPoints).toBe(0);
});
it('does not carry queued work across event or season boundaries', () => {
  const { w, a } = fixture();
  let s = executeCommand(w, 'alice', { type: 'build', villageId: a, building: 'lumber' }, now + 604800000 - 30000);
  s = advanceWorld(s, s.villages[a].build!.endsAt);
  expect(projectWorld(s, 'alice', s.updatedAt).allianceEvent?.ownPoints).toBe(0);
  const trainAt = now + 1209600000 - 10000;
  s = executeCommand(s, 'alice', { type: 'train', villageId: a, unit: 'guard', count: 1 }, trainAt);
  s = advanceWorld(s, s.villages[a].training!.endsAt);
  expect(projectWorld(s, 'alice', s.updatedAt).allianceEvent?.ownPoints).toBe(0);
  s.season.endsAt = s.updatedAt + 1000;
  s.villages[a].build = { building: 'farm', level: 1, endsAt: s.season.endsAt, allianceEvent: { eventKey: 's1-w2', allianceId: s.players.alice.allianceId! } };
  expect(projectWorld(s, 'alice', s.season.endsAt).allianceEvent).toBeNull();
});
it('locks positive participation through kicks and switching, but allows joining before contribution', () => {
  const { w, a, b } = fixture();
  let s = executeCommand(w, 'bob', { type: 'build', villageId: b, building: 'lumber' }, now);
  s = advanceWorld(s, s.villages[b].build!.endsAt);
  s = executeCommand(s, 'alice', { type: 'allianceKick', playerId: 'bob' }, s.updatedAt);
  s = executeCommand(s, 'bob', { type: 'allianceCreate', name: 'عهد آخر' }, s.updatedAt);
  expect(projectWorld(s, 'bob', s.updatedAt).allianceEvent).toMatchObject({ lockedToOtherAlliance: true, ownPoints: 0, canClaim: false });
  s = executeCommand(s, 'bob', { type: 'build', villageId: b, building: 'quarry' }, s.updatedAt);
  s = advanceWorld(s, s.villages[b].build!.endsAt);
  expect(projectWorld(s, 'bob', s.updatedAt).allianceEvent?.points).toBe(0);
  expect(projectWorld(s, 'alice', s.updatedAt).allianceEvent?.points).toBe(5);
  s = executeCommand(s, 'alice', { type: 'build', villageId: a, building: 'lumber' }, s.updatedAt);
  s = executeCommand(s, 'alice', { type: 'allianceLeave' }, s.updatedAt);
  s = advanceWorld(s, s.villages[a].build!.endsAt);
  expect(s.players.alice.allianceEvent).toBeUndefined();
});
it('does not leak contributor claims or partners to outsiders or other members', () => {
  const { w, allianceId } = fixture();
  w.players.alice.allianceEvent = { eventKey: 's1-w0', allianceId, points: 20, claimed: true, tradedWith: ['secret-partner'] };
  const member = projectWorld(w, 'bob', now);
  expect(member.allianceEvent?.contributors).toEqual([{ id: 'alice', name: 'مملكة النور', points: 20 }]);
  expect(JSON.stringify(member)).not.toContain('secret-partner');
  expect(member.allianceEvent?.claimed).toBe(false);
  expect(projectWorld(w, 'outsider', now).allianceEvent).toMatchObject({ contributors: [], points: 0, canClaim: false });
});
it('rejects malformed, unexpected and stale claim inputs', () => {
  const { w, a } = fixture();
  for (const eventKey of ['s0-w0', '__proto__', 's1-w0-extra', 's1-w9999999999999999999999999999999999999999999999999999999999999999']) {
    expect(() => executeCommand(w, 'alice', { type: 'allianceEventClaim', villageId: a, eventKey }, now)).toThrow();
  }
  expect(() => executeCommand(w, 'alice', { type: 'allianceEventClaim', villageId: a, eventKey: 's1-w0', points: 100 } as never, now)).toThrow();
  expect(() => executeCommand(w, 'alice', { type: 'allianceEventClaim', villageId: a, eventKey: 's1-w0' }, now + 604800000)).toThrow();
  expect(() => executeCommand(w, 'alice', { type: 'allianceEventClaim', villageId: a, eventKey: 's1-w8' }, w.season.endsAt)).toThrow();
});
it('bounds unique trading partners and never replays a previous week claim', () => {
  const { w, a } = fixture();
  const at = now + 1209600000;
  let s = advanceWorld(w, at);
  for (let index = 0; index < 5; index++) {
    const actor = `trader${index}`;
    s = executeCommand(s, actor, { type: 'found', name: `مملكة التاجر ${index}` }, at);
    const villageId = Object.values(s.villages).find(v => v.ownerId === actor)!.id;
    s.villages[villageId].buildings.market = 1;
    s = executeCommand(s, 'alice', { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 100) }, at);
    s = executeCommand(s, actor, { type: 'tradeAccept', villageId, offerId: s.offers[0].id }, at);
  }
  expect(projectWorld(s, 'alice', at).allianceEvent?.ownPoints).toBe(20);
  expect(s.players.alice.allianceEvent?.tradedWith).toEqual(['trader0', 'trader1', 'trader2', 'trader3']);
  expect(() => executeCommand(s, 'alice', { type: 'allianceEventClaim', villageId: a, eventKey: 's1-w1' }, at)).toThrow();
});
it('rejects claiming without contribution, completed goal or current membership', () => {
  const { w, a, allianceId } = fixture();
  const claim = { type: 'allianceEventClaim' as const, villageId: a, eventKey: 's1-w0' };
  w.players.bob.allianceEvent = { eventKey: 's1-w0', allianceId, points: 20, claimed: false, tradedWith: [] };
  expect(() => executeCommand(w, 'alice', claim, now)).toThrow();
  w.players.alice.allianceEvent = { eventKey: 's1-w0', allianceId, points: 5, claimed: false, tradedWith: [] };
  expect(() => executeCommand(w, 'alice', claim, now)).toThrow();
  w.players.alice.allianceEvent.points = 20;
  delete w.alliances[allianceId].members.alice;
  expect(() => executeCommand(w, 'alice', claim, now)).toThrow();
});
it('allows new members to contribute but never credits queues started before joining', () => {
  const { w, allianceId } = fixture();
  let s = executeCommand(w, 'carol', { type: 'found', name: 'مملكة الفجر' }, now);
  const villageId = Object.values(s.villages).find(v => v.ownerId === 'carol')!.id;
  s.villages[villageId].buildings.embassy = 1;
  s = executeCommand(s, 'carol', { type: 'build', villageId, building: 'lumber' }, now);
  s = executeCommand(s, 'carol', { type: 'allianceJoin', allianceId }, now);
  s = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'carol' }, now);
  s = advanceWorld(s, s.villages[villageId].build!.endsAt);
  expect(projectWorld(s, 'carol', s.updatedAt).allianceEvent?.ownPoints).toBe(0);
  s = executeCommand(s, 'carol', { type: 'build', villageId, building: 'quarry' }, s.updatedAt);
  s = advanceWorld(s, s.villages[villageId].build!.endsAt);
  expect(projectWorld(s, 'carol', s.updatedAt).allianceEvent?.ownPoints).toBe(5);
});
it('cannot earn queue credit by switching alliances before its completion', () => {
  const { w, b } = fixture();
  let s = executeCommand(w, 'bob', { type: 'build', villageId: b, building: 'lumber' }, now);
  s = executeCommand(s, 'bob', { type: 'allianceLeave' }, now);
  s = executeCommand(s, 'bob', { type: 'allianceCreate', name: 'تحالف جديد' }, now);
  s = advanceWorld(s, s.villages[b].build!.endsAt);
  expect(projectWorld(s, 'bob', s.updatedAt).allianceEvent?.ownPoints).toBe(0);
});


it('preserves reserved alliance stamps across queue activation and legacy loading', () => {
  const { w, a } = fixture();
  let s = executeCommand(w, 'alice', { type: 'build', villageId: a, building: 'lumber' }, now);
  s = executeCommand(s, 'alice', { type: 'build', villageId: a, building: 'quarry' }, now);
  const end = s.villages[a].constructionQueue![1].endsAt;
  const finished = advanceWorld(s, end);
  expect(projectWorld(finished, 'alice', end).allianceEvent?.ownPoints).toBe(10);
  expect(projectWorld(advanceWorld(finished, end), 'alice', end).allianceEvent?.ownPoints).toBe(10);
  const legacy = structuredClone(s);
  delete legacy.villages[a].constructionQueue;
  expect(projectWorld(legacy, 'alice', end).allianceEvent?.ownPoints).toBe(5);
  const cancelled = executeCommand(s, 'alice', { type: 'cancelBuild', villageId: a, itemId: s.villages[a].constructionQueue![1].id }, now);
  expect(projectWorld(cancelled, 'alice', end).allianceEvent?.ownPoints).toBe(5);
});
