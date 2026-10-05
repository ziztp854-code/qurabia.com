import { describe, expect, it } from 'vitest';
import { advanceWorld, createWorld, executeCommand, projectWorld } from './engine';
import { resources } from './config';
import { emptyTroops, production } from './simulation';
import type { KingdomsWorld } from './types';
const now = 1_800_000_000_000;
function fixture() {
  let w = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'مملكة النور' }, now);
  w = executeCommand(w, 'bob', { type: 'found', name: 'مملكة الظل' }, now);
  const [a, b] = Object.values(w.villages);
  for (const v of [a, b]) {
    v.buildings.market = 1;
    v.buildings.embassy = 1;
    v.troops = { ...emptyTroops(), guard: 30, rider: 10, scout: 5, settler: 1 };
  }
  w.players.alice.protectionUntil = now;
  w.players.bob.protectionUntil = now;
  return { w, a: a.id, b: b.id };
}
function send(
  w: KingdomsWorld,
  a: string,
  b: string,
  mission: 'attack' | 'raid' | 'scout' | 'reinforce' = 'attack',
) {
  const target = w.villages[b];
  return executeCommand(
    w,
    'alice',
    {
      type: 'march',
      villageId: a,
      targetX: target.x,
      targetY: target.y,
      mission,
      troops:
        mission === 'scout'
          ? { ...emptyTroops(), scout: 5 }
          : { ...emptyTroops(), guard: 10, rider: 5 },
    },
    now,
  );
}
describe('Kingdoms multiplayer rules', () => {
  it.each(['stationed', 'outgoing', 'returning'] as const)(
    'counts %s armies toward the training cap',
    (location) => {
      const { w, a, b } = fixture();
      w.villages[a].troops = emptyTroops();
      w.villages[a].buildings.barracks = 1;
      const troops = { ...emptyTroops(), guard: 1000000 };
      if (location === 'stationed') w.villages[b].reinforcements[a] = troops;
      else
        w.movements = [
          {
            id: 'test-move',
            ownerId: 'alice',
            sourceId: a,
            targetX: w.villages[b].x,
            targetY: w.villages[b].y,
            mission: location === 'returning' ? 'return' : 'attack',
            troops,
            departedAt: now,
            arrivesAt: now + 60000,
            travelMs: 60000,
            loot: resources(),
          },
        ];
      expect(() =>
        executeCommand(w, 'alice', { type: 'train', villageId: a, unit: 'guard', count: 1 }, now),
      ).toThrow('الحد الأعلى');
      expect(w.villages[a].resources.wood).toBe(900);
    },
  );
  it('limits reinforcement reports to actual participants and removes destroyed garrisons', () => {
    const { w, a, b } = fixture();
    let s = executeCommand(w, 'carol', { type: 'found', name: 'مملكة الفجر' }, now);
    s = executeCommand(s, 'dave', { type: 'found', name: 'مملكة السهل' }, now);
    const carol = Object.values(s.villages).find((v) => v.ownerId === 'carol')!.id;
    const dave = Object.values(s.villages).find((v) => v.ownerId === 'dave')!.id;
    s.villages[b].troops = emptyTroops();
    s.villages[b].reinforcements = {
      [carol]: { ...emptyTroops(), guard: 1 },
      [dave]: emptyTroops(),
    };
    s = send(s, a, b);
    s = advanceWorld(s, s.movements[0].arrivesAt);
    const first = s.reports.find((r) => r.combat)!;
    expect(first.recipients).toContain('carol');
    expect(first.recipients).not.toContain('dave');
    expect(s.villages[b].reinforcements).toEqual({});
    const target = s.villages[b];
    s = executeCommand(
      s,
      'alice',
      {
        type: 'march',
        villageId: a,
        targetX: target.x,
        targetY: target.y,
        mission: 'attack',
        troops: { ...emptyTroops(), guard: 5 },
      },
      s.updatedAt,
    );
    s = advanceWorld(s, s.movements.find((m) => m.mission === 'attack')!.arrivesAt);
    const battles = s.reports.filter((r) => r.combat);
    expect(battles).toHaveLength(2);
    expect(battles[1].recipients).not.toContain('carol');
    expect(projectWorld(s, 'carol', s.updatedAt).reports.filter((r) => r.combat)).toHaveLength(1);
  });
  it('requires admission consent and cannot cancel incoming attacks through a join request', () => {
    const { w, a, b } = fixture();
    let s = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    const id = s.players.alice.allianceId!;
    s = send(s, a, b);
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: id }, now);
    expect(s.players.bob.allianceId).toBeUndefined();
    expect(Object.keys(s.alliances[id].members)).toEqual(['alice']);
    expect(advanceWorld(s, s.movements[0].arrivesAt).reports.some((r) => r.combat)).toBe(true);
    expect(() =>
      executeCommand(s, 'bob', { type: 'allianceApprove', playerId: 'bob' }, now),
    ).toThrow();
    const approved = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
    expect(approved.players.bob.allianceId).toBe(id);
    expect(approved.alliances[id].pending).toEqual([]);
    expect(() =>
      executeCommand(approved, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now),
    ).toThrow();
  });
  it('protects pending applications and enforces reject and kick ranks', () => {
    const { w } = fixture();
    let s = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    const id = s.players.alice.allianceId!;
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: id }, now);
    expect(projectWorld(s, 'alice', now).alliances[0].pending).toEqual(['bob']);
    expect(projectWorld(s, 'bob', now).alliances[0].pending).toEqual(['bob']);
    expect(projectWorld(s, 'outsider', now).alliances[0].pending).toEqual([]);
    expect(() => executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: id }, now)).toThrow();
    s = executeCommand(s, 'alice', { type: 'allianceReject', playerId: 'bob' }, now);
    expect(s.alliances[id].pending).toEqual([]);
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: id }, now);
    s = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
    expect(() =>
      executeCommand(s, 'bob', { type: 'allianceKick', playerId: 'alice' }, now),
    ).toThrow();
    s = executeCommand(s, 'alice', { type: 'allianceRole', playerId: 'bob', role: 'officer' }, now);
    expect(() =>
      executeCommand(s, 'bob', { type: 'allianceKick', playerId: 'alice' }, now),
    ).toThrow();
    expect(() =>
      executeCommand(s, 'alice', { type: 'allianceKick', playerId: 'alice' }, now),
    ).toThrow();
    s = executeCommand(s, 'alice', { type: 'allianceKick', playerId: 'bob' }, now);
    expect(s.players.bob.allianceId).toBeUndefined();
  });
  it('removes other pending applications after approval and caps request queues', () => {
    const { w } = fixture();
    let s = executeCommand(w, 'carol', { type: 'found', name: 'مملكة الفجر' }, now);
    Object.values(s.villages).find((v) => v.ownerId === 'carol')!.buildings.embassy = 1;
    s = executeCommand(s, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    s = executeCommand(s, 'carol', { type: 'allianceCreate', name: 'عهد الفجر' }, now);
    const first = s.players.alice.allianceId!,
      second = s.players.carol.allianceId!;
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: first }, now);
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: second }, now);
    s = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
    expect(s.alliances[second].pending).toEqual([]);
    expect(() =>
      executeCommand(s, 'carol', { type: 'allianceApprove', playerId: 'bob' }, now),
    ).toThrow();
    s = executeCommand(s, 'bob', { type: 'allianceLeave' }, now);
    s.alliances[first].pending = Array.from({ length: 50 }, (_, i) => `applicant${i}`);
    expect(() =>
      executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: first }, now),
    ).toThrow('ممتلئة');
  });
  it('lets officers approve and remove members but never remove another officer', () => {
    const { w } = fixture();
    let s = executeCommand(w, 'carol', { type: 'found', name: 'مملكة الفجر' }, now);
    Object.values(s.villages).find((v) => v.ownerId === 'carol')!.buildings.embassy = 1;
    s = executeCommand(s, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    const id = s.players.alice.allianceId!;
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: id }, now);
    s = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
    s = executeCommand(s, 'alice', { type: 'allianceRole', playerId: 'bob', role: 'officer' }, now);
    s = executeCommand(s, 'carol', { type: 'allianceJoin', allianceId: id }, now);
    s = executeCommand(s, 'bob', { type: 'allianceApprove', playerId: 'carol' }, now);
    const promoted = executeCommand(
      s,
      'alice',
      { type: 'allianceRole', playerId: 'carol', role: 'officer' },
      now,
    );
    expect(() =>
      executeCommand(promoted, 'bob', { type: 'allianceKick', playerId: 'carol' }, now),
    ).toThrow();
    const kicked = executeCommand(s, 'bob', { type: 'allianceKick', playerId: 'carol' }, now);
    expect(kicked.players.carol.allianceId).toBeUndefined();
  });
  it('stations and recalls reinforcements without duplicating soldiers', () => {
    const { w, a, b } = fixture();
    let s = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    s = executeCommand(
      s,
      'bob',
      { type: 'allianceJoin', allianceId: s.players.alice.allianceId! },
      now,
    );
    s = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
    s = send(s, a, b, 'reinforce');
    s = advanceWorld(s, s.movements[0].arrivesAt);
    expect(s.villages[b].reinforcements[a].guard).toBe(10);
    const recalled = executeCommand(
      s,
      'alice',
      { type: 'recall', villageId: a, hostVillageId: b },
      s.updatedAt,
    );
    expect(recalled.villages[b].reinforcements[a]).toBeUndefined();
    expect(() =>
      executeCommand(
        recalled,
        'alice',
        { type: 'recall', villageId: a, hostVillageId: b },
        recalled.updatedAt,
      ),
    ).toThrow();
    const home = advanceWorld(recalled, recalled.movements[0].arrivesAt);
    expect(home.villages[a].troops.guard).toBe(30);
  });
  it('reports and scores actual rounding of separate defender groups', () => {
    const { w, a, b } = fixture();
    w.villages[b].troops = { ...emptyTroops(), guard: 1 };
    w.villages[b].reinforcements[a] = { ...emptyTroops(), guard: 1 };
    const target = w.villages[b];
    const sent = executeCommand(
      w,
      'alice',
      {
        type: 'march',
        villageId: a,
        targetX: target.x,
        targetY: target.y,
        mission: 'attack',
        troops: { ...emptyTroops(), guard: 1 },
      },
      now,
    );
    const result = advanceWorld(sent, sent.movements[0].arrivesAt);
    const combat = result.reports.find((r) => r.combat)!.combat!;
    const actual =
      result.villages[b].troops.guard + (result.villages[b].reinforcements[a]?.guard ?? 0);
    expect(combat.defenderAfter.guard).toBe(actual);
    expect(result.players.alice.score).toBe(2 - actual);
  });
  it('accepts balanced throne contributions only after unlock and settles alliance winner', () => {
    const { w, a } = fixture();
    const command = {
      type: 'throne' as const,
      villageId: a,
      resources: resources(100, 100, 100, 100, 10),
    };
    expect(() => executeCommand(w, 'alice', command, now)).toThrow('مرحلة');
    let s = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    const unlock =
      s.season.startsAt + (s.season.endsAt - s.season.startsAt) * s.config.throneUnlockFraction;
    s = executeCommand(s, 'alice', command, unlock);
    expect(s.players.alice.throne).toBe(100);
    const ended = advanceWorld(s, s.season.endsAt);
    expect(ended.season.winnerId).toBe('alice');
    expect(ended.season.winnerAllianceId).toBe(s.players.alice.allianceId);
  });
  it('retains construction deadline when balancing settings change', () => {
    const { w, a } = fixture();
    const s = executeCommand(w, 'alice', { type: 'build', villageId: a, building: 'farm' }, now);
    const end = s.villages[a].build!.endsAt;
    s.config.buildings.farm.seconds *= 10;
    expect(advanceWorld(s, end).villages[a].buildings.farm).toBe(1);
  });
  it('reserves troops, resolves server combat, returns only survivors and loot', () => {
    const { w, a, b } = fixture();
    w.villages[b].troops = emptyTroops();
    const sent = send(w, a, b);
    expect(sent.villages[a].troops.guard).toBe(20);
    const arrival = sent.movements[0].arrivesAt;
    const battle = advanceWorld(sent, arrival);
    expect(battle.reports.find((r) => r.combat)?.combat?.attackerAfter.guard).toBe(10);
    expect(battle.movements[0].mission).toBe('return');
    const home = advanceWorld(battle, arrival + sent.movements[0].travelMs);
    expect(home.villages[a].troops.guard).toBe(30);
    expect(home.movements).toHaveLength(0);
    expect(advanceWorld(home, home.updatedAt)).toEqual(home);
  });
  it('protects beginners and prevents own or allied attacks', () => {
    const { w, a, b } = fixture();
    w.players.bob.protectionUntil = now + 10000;
    expect(() => send(w, a, b)).toThrow('حماية');
    w.players.bob.protectionUntil = now;
    const wa = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    const pending = executeCommand(
      wa,
      'bob',
      { type: 'allianceJoin', allianceId: wa.players.alice.allianceId! },
      now,
    );
    const allied = executeCommand(
      pending,
      'alice',
      { type: 'allianceApprove', playerId: 'bob' },
      now,
    );
    expect(() => send(allied, a, b)).toThrow('حليف');
  });
  it.each(['ally', 'peace'] as const)(
    'requires bilateral %s at dispatch and arrival; war overrides',
    (status) => {
      const { w, a, b } = fixture();
      let s = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'النور' }, now);
      s = executeCommand(s, 'bob', { type: 'allianceCreate', name: 'الظل' }, now);
      const aa = s.players.alice.allianceId!,
        bb = s.players.bob.allianceId!;
      s = executeCommand(s, 'bob', { type: 'diplomacy', allianceId: aa, status }, now);
      const sent = send(s, a, b);
      expect(sent.movements).toHaveLength(1);
      const agreed = executeCommand(
        sent,
        'alice',
        { type: 'diplomacy', allianceId: bb, status },
        now,
      );
      expect(() => send(agreed, a, b)).toThrow();
      const arrived = advanceWorld(agreed, sent.movements[0].arrivesAt);
      expect(arrived.reports.some((r) => r.combat)).toBe(false);
      const war = executeCommand(
        agreed,
        'alice',
        { type: 'diplomacy', allianceId: bb, status: 'war' },
        now,
      );
      expect(() => send(war, a, b)).not.toThrow();
    },
  );
  it('charges upkeep for troops in transit and reinforcements', () => {
    const { w, a, b } = fixture();
    const before = production(w, w.villages[a]).food;
    const sent = send(w, a, b);
    expect(production(sent, sent.villages[a]).food).toBe(before);
    sent.villages[a].troops.guard -= 5;
    sent.villages[b].reinforcements[a] = { ...emptyTroops(), guard: 5 };
    expect(production(sent, sent.villages[a]).food).toBe(before);
  });
  it('resolves scouts without exposing intel on failure', () => {
    const { w, a, b } = fixture();
    w.villages[b].troops.scout = 2;
    const sent = send(w, a, b, 'scout'),
      arrived = advanceWorld(sent, sent.movements[0].arrivesAt);
    const intel = arrived.reports.find((r) => r.intel);
    expect(intel?.recipients).toEqual(['alice']);
    expect(intel?.intel?.troops.scout).toBe(2);
    w.villages[b].troops.scout = 10;
    const failed = send(w, a, b, 'scout');
    expect(advanceWorld(failed, failed.movements[0].arrivesAt).reports.some((r) => r.intel)).toBe(
      false,
    );
  });
  it('escrows trade resources; stale accepts cannot spend twice', () => {
    const { w, a, b } = fixture();
    const offered = executeCommand(
      w,
      'alice',
      { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 80) },
      now,
    );
    expect(offered.villages[a].resources.wood).toBe(800);
    const accepted = executeCommand(
      offered,
      'bob',
      { type: 'tradeAccept', villageId: b, offerId: offered.offers[0].id },
      now,
    );
    expect(accepted.villages[b].resources.wood).toBe(1000);
    expect(accepted.villages[a].resources.stone).toBe(980);
    expect(() =>
      executeCommand(
        accepted,
        'bob',
        { type: 'tradeAccept', villageId: b, offerId: offered.offers[0].id },
        now,
      ),
    ).toThrow();
    expect(accepted.players.bob.achievements).toContain('merchant');
  });
  it('cancels escrow once and rejects another player cancelling', () => {
    const { w, a } = fixture();
    const s = executeCommand(
      w,
      'alice',
      { type: 'tradeOffer', villageId: a, give: resources(100), want: resources(0, 80) },
      now,
    );
    const c = { type: 'tradeCancel' as const, offerId: s.offers[0].id };
    expect(() => executeCommand(s, 'bob', c, now)).toThrow();
    const cancelled = executeCommand(s, 'alice', c, now);
    expect(cancelled.villages[a].resources.wood).toBe(900);
    expect(() => executeCommand(cancelled, 'alice', c, now)).toThrow();
  });
  it('enforces alliance roles and leader transfer', () => {
    const { w } = fixture();
    let s = executeCommand(w, 'alice', { type: 'allianceCreate', name: 'عهد النور' }, now);
    const id = s.players.alice.allianceId!;
    s = executeCommand(s, 'bob', { type: 'allianceJoin', allianceId: id }, now);
    s = executeCommand(s, 'alice', { type: 'allianceApprove', playerId: 'bob' }, now);
    expect(() =>
      executeCommand(s, 'bob', { type: 'allianceRole', playerId: 'bob', role: 'leader' }, now),
    ).toThrow();
    expect(() => executeCommand(s, 'alice', { type: 'allianceLeave' }, now)).toThrow();
    s = executeCommand(s, 'alice', { type: 'allianceRole', playerId: 'bob', role: 'leader' }, now);
    expect(s.alliances[id].members.bob).toBe('leader');
    expect(s.alliances[id].members.alice).toBe('officer');
  });
  it('settles vacant land once and refunds failed competing settlement', () => {
    const { w, a, b } = fixture();
    const order = {
      type: 'march' as const,
      targetX: 10,
      targetY: 10,
      mission: 'settle' as const,
      troops: { ...emptyTroops(), settler: 1 },
    };
    let s = executeCommand(w, 'alice', { ...order, villageId: a }, now);
    s = executeCommand(s, 'bob', { ...order, villageId: b }, now);
    const end = Math.max(...s.movements.map((m) => m.arrivesAt));
    s = advanceWorld(s, end);
    expect(Object.values(s.villages).filter((v) => v.x === 10 && v.y === 10)).toHaveLength(1);
    expect(s.movements).toHaveLength(1);
    expect(s.movements[0].mission).toBe('return');
  });
  it('occupies territory with actual traveling troops', () => {
    const { w, a } = fixture();
    const s = executeCommand(
      w,
      'alice',
      {
        type: 'march',
        villageId: a,
        targetX: 12,
        targetY: 12,
        mission: 'occupy',
        troops: { ...emptyTroops(), guard: 5 },
      },
      now,
    );
    const arrived = advanceWorld(s, s.movements[0].arrivesAt);
    expect(arrived.territories['12,12']).toBe('alice');
    expect(arrived.movements[0].mission).toBe('return');
  });
  it('rejects unsafe derived timers even with valid bounded config fields', () => {
    const { w, a } = fixture();
    w.config.buildings.hall.seconds = 1e9;
    expect(() =>
      executeCommand(w, 'alice', { type: 'build', villageId: a, building: 'hall' }, now),
    ).toThrow('مدة');
    w.config.units.guard.speed = 0.01;
    w.config.secondsPerTile = 1e9;
    expect(() =>
      executeCommand(
        w,
        'alice',
        {
          type: 'march',
          villageId: a,
          targetX: 10,
          targetY: 10,
          mission: 'occupy',
          troops: { ...emptyTroops(), guard: 5 },
        },
        now,
      ),
    ).toThrow('مدة');
  });
});
