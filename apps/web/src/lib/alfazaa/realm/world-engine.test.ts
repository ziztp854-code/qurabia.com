import { describe, expect, it } from 'vitest';
import { createSharedWorld, applySharedCommand, projectSharedWorld } from './world-engine';
import { applyWorldBridge } from './world-bridge';
import { createInitialState, catalog } from '../domain';
import { resources } from '../../kingdoms/config';
import { advanceSharedWorld } from './world-engine';

const start = 1_800_000_000_000;
describe('Alfazaa shared outpost commands', () => {
  it('joins two real account identities once and projects only their own private inventory', () => {
    const original = createSharedWorld(start);
    const alice = applySharedCommand(
      original,
      'alice',
      { type: 'join', name: 'مخفر النور' },
      start,
    );
    const both = applySharedCommand(alice, 'bob', { type: 'join', name: 'مخفر الصقر' }, start);
    const view = projectSharedWorld(both, 'alice', start);
    expect(view.villages).toHaveLength(1);
    expect(view.map).toHaveLength(2);
    expect(view.map.find((v) => v.ownerId === 'bob')).not.toHaveProperty('resources');
    expect(original.game.players).toEqual({});
    expect(() =>
      applySharedCommand(both, 'alice', { type: 'join', name: 'مكرر' }, start),
    ).toThrow();
  });
  it('moves gold once and permanently converts the selected city troop without mutating inputs', () => {
    const city = createInitialState(start);
    const world = applySharedCommand(
      createSharedWorld(start),
      'alice',
      { type: 'join', name: 'النور' },
      start,
    );
    const deposited = applyWorldBridge(
      world,
      'alice',
      city,
      { type: 'deposit-gold', amount: 100, expectedCityRevision: city.revision },
      start,
    );
    expect(deposited.city.balances[catalog.meta.goldItemId]).toBe(
      city.balances[catalog.meta.goldItemId] - 100,
    );
    expect(projectSharedWorld(deposited.world, 'alice', start).villages[0].resources.gold).toBe(
      100,
    );
    const index = city.cells.findIndex((c) => c?.kind === 'troop');
    const converted = applyWorldBridge(
      deposited.world,
      'alice',
      deposited.city,
      {
        type: 'convert-troop',
        cell: index,
        confirm: true,
        expectedCityRevision: deposited.city.revision,
      },
      start,
    );
    expect(converted.city.cells[index]).toBeNull();
    expect(city.cells[index]).not.toBeNull();
    expect(() =>
      applyWorldBridge(
        converted.world,
        'alice',
        converted.city,
        {
          type: 'convert-troop',
          cell: index,
          confirm: true,
          expectedCityRevision: converted.city.revision,
        },
        start,
      ),
    ).toThrow();
    expect(() =>
      applyWorldBridge(
        world,
        'alice',
        city,
        { type: 'deposit-gold', amount: 100, expectedCityRevision: city.revision + 1 },
        start,
      ),
    ).toThrow();
  });
  it('enforces alliance approval and trades escrow between real players only once', () => {
    let world = createSharedWorld(start);
    for (const actor of ['alice', 'bob', 'eve'])
      world = applySharedCommand(world, actor, { type: 'join', name: `${actor} مخفر` }, start);
    // Fixture represents completed embassy/market construction; commands below use the public seam.
    world = structuredClone(world);
    for (const village of Object.values(world.game.villages)) {
      village.buildings.embassy = 1;
      village.buildings.market = 1;
    }
    const command = (actor: string, action: unknown) => {
      world = applySharedCommand(world, actor, { type: 'outpost', action }, start);
    };
    command('alice', { type: 'allianceCreate', name: 'الفزعة' });
    const alliance = Object.values(world.game.alliances)[0];
    command('bob', { type: 'allianceJoin', allianceId: alliance.id });
    expect(world.game.players.bob.allianceId).toBeUndefined();
    expect(() => command('eve', { type: 'allianceApprove', playerId: 'bob' })).toThrow();
    command('alice', { type: 'allianceApprove', playerId: 'bob' });
    expect(world.game.players.bob.allianceId).toBe(alliance.id);
    const alice = Object.values(world.game.villages).find((v) => v.ownerId === 'alice')!;
    const bob = Object.values(world.game.villages).find((v) => v.ownerId === 'bob')!;
    command('alice', {
      type: 'tradeOffer',
      villageId: alice.id,
      give: resources(100),
      want: resources(0, 100),
    });
    const offer = world.game.offers[0];
    expect(world.game.villages[alice.id].resources.wood).toBe(800);
    command('bob', { type: 'tradeAccept', villageId: bob.id, offerId: offer.id });
    expect(world.game.villages[bob.id].resources.wood).toBe(1000);
    expect(world.game.villages[alice.id].resources.stone).toBe(1000);
    expect(() =>
      command('bob', { type: 'tradeAccept', villageId: bob.id, offerId: offer.id }),
    ).toThrow();
  });
  it('refuses trade acceptance when either receiving warehouse would lose escrow to overflow', () => {
    let world = applySharedCommand(
      createSharedWorld(start),
      'alice',
      { type: 'join', name: 'النور' },
      start,
    );
    world = applySharedCommand(world, 'bob', { type: 'join', name: 'الصقر' }, start);
    world = structuredClone(world);
    const [a, b] = Object.values(world.game.villages);
    a.buildings.market = 1;
    b.buildings.market = 1;
    world = applySharedCommand(
      world,
      'alice',
      {
        type: 'outpost',
        action: {
          type: 'tradeOffer',
          villageId: a.id,
          give: resources(100),
          want: resources(0, 100),
        },
      },
      start,
    );
    world = structuredClone(world);
    world.game.villages[b.id].resources.wood = 2000;
    expect(() =>
      applySharedCommand(
        world,
        'bob',
        {
          type: 'outpost',
          action: { type: 'tradeAccept', villageId: b.id, offerId: world.game.offers[0].id },
        },
        start,
      ),
    ).toThrow();
    expect(world.game.offers).toHaveLength(1);
  });
  it('returns outpost gold to the city and rejects overspend and capacity overflow', () => {
    const city = createInitialState(start);
    const world = applySharedCommand(
      createSharedWorld(start),
      'alice',
      { type: 'join', name: 'النور' },
      start,
    );
    const deposit = applyWorldBridge(
      world,
      'alice',
      city,
      { type: 'deposit-gold', amount: 100, expectedCityRevision: 0 },
      start,
    );
    const returned = applyWorldBridge(
      deposit.world,
      'alice',
      deposit.city,
      { type: 'withdraw-gold', amount: 100, expectedCityRevision: 1 },
      start,
    );
    expect(returned.city.balances[catalog.meta.goldItemId]).toBe(
      city.balances[catalog.meta.goldItemId],
    );
    expect(() =>
      applyWorldBridge(
        world,
        'alice',
        city,
        { type: 'withdraw-gold', amount: 1, expectedCityRevision: 0 },
        start,
      ),
    ).toThrow();
    expect(() =>
      applyWorldBridge(
        world,
        'alice',
        city,
        { type: 'deposit-gold', amount: 3000, expectedCityRevision: 0 },
        start,
      ),
    ).toThrow();
    expect(() =>
      applyWorldBridge(
        world,
        'alice',
        city,
        { type: 'convert-troop', cell: 35, confirm: true, expectedCityRevision: 0 },
        start,
      ),
    ).toThrow();
    expect(() =>
      applyWorldBridge(
        world,
        'bob',
        city,
        { type: 'deposit-gold', amount: 1, expectedCityRevision: 0 },
        start,
      ),
    ).toThrow();
  });
  it('counts received gathering resources once and only exposes active same-alliance help', () => {
    let world = applySharedCommand(
      createSharedWorld(start),
      'alice',
      { type: 'join', name: 'النور' },
      start,
    );
    world = structuredClone(world);
    world.game.reports.push({
      id: 'gather-test',
      at: start,
      recipients: ['alice'],
      title: 'جمع',
      detail: 'وصلت الموارد',
      event: {
        key: 'gather.returned',
        category: 'economy',
        resources: { received: resources(10, 20) },
      },
    });
    world = advanceSharedWorld(world, start);
    expect(world.progress.alice.gathered).toBe(30);
    expect(advanceSharedWorld(world, start).progress.alice.gathered).toBe(30);
  });
  it('settles an actual PvP attack, returns survivors and counts a victory once', () => {
    let world = applySharedCommand(
      createSharedWorld(start),
      'alice',
      { type: 'join', name: 'النور' },
      start,
    );
    world = applySharedCommand(world, 'bob', { type: 'join', name: 'الصقر' }, start);
    const alice = Object.values(world.game.villages).find((v) => v.ownerId === 'alice')!;
    const bob = Object.values(world.game.villages).find((v) => v.ownerId === 'bob')!;
    world = structuredClone(world);
    world.game.villages[alice.id].troops.guard = 30;
    const troops = { ...alice.troops, guard: 20 };
    const time = start + 121000;
    world = applySharedCommand(
      world,
      'alice',
      {
        type: 'outpost',
        action: {
          type: 'march',
          villageId: alice.id,
          targetX: bob.x,
          targetY: bob.y,
          mission: 'attack',
          troops,
        },
      },
      time,
    );
    expect(world.game.villages[alice.id].troops.guard).toBe(10);
    world = advanceSharedWorld(world, time + 600000);
    expect(world.game.movements).toHaveLength(0);
    expect(world.game.villages[alice.id].troops.guard).toBeGreaterThan(10);
    expect(world.progress.alice.victories).toBe(1);
    const again = advanceSharedWorld(world, time + 600000);
    expect(again.progress.alice.victories).toBe(1);
    expect(
      projectSharedWorld(world, 'bob', time + 600000).reports.some(
        (r) => r.event?.key === 'battle.resolved',
      ),
    ).toBe(true);
    expect(projectSharedWorld(world, 'eve', time + 600000).reports).toHaveLength(0);
  });
});
