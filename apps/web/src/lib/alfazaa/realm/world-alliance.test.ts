import { describe, it, expect } from 'vitest';
import { createSharedWorld, applySharedCommand } from './world-engine';
import { projectSharedWorld, advanceSharedWorld } from './world-engine';
describe('Alfazaa independent alliance economy', () => {
  it('spends donations once, limits research to officers, and claims boss reward once per contributor', () => {
    const now = 1800000000000;
    let world = applySharedCommand(
      createSharedWorld(now),
      'alice',
      { type: 'join', name: 'النور' },
      now,
    );
    world = applySharedCommand(world, 'bob', { type: 'join', name: 'الصقر' }, now);
    world = structuredClone(world);
    for (const v of Object.values(world.game.villages)) {
      v.buildings.embassy = 1;
      v.resources.gold = 500;
      v.troops.guard = 100;
    }
    const send = (actor: string, command: unknown) => {
      world = applySharedCommand(world, actor, command, now);
    };
    send('alice', { type: 'outpost', action: { type: 'allianceCreate', name: 'الفزعة' } });
    const id = world.game.players.alice.allianceId!;
    send('bob', { type: 'outpost', action: { type: 'allianceJoin', allianceId: id } });
    send('alice', { type: 'outpost', action: { type: 'allianceApprove', playerId: 'bob' } });
    send('alice', { type: 'alliance-donate', amount: 200 });
    expect(world.guilds![id].treasury).toBe(200);
    expect(() => send('bob', { type: 'alliance-research' })).toThrow();
    send('alice', { type: 'alliance-research' });
    expect(world.guilds![id].trainingLevel).toBe(1);
    send('alice', { type: 'alliance-boss', count: 100, unit: 'guard' });
    expect(world.guilds![id].boss!.hp).toBe(0);
    send('alice', { type: 'alliance-boss-claim' });
    expect(() => send('alice', { type: 'alliance-boss-claim' })).toThrow();
    expect(() => send('bob', { type: 'alliance-boss-claim' })).toThrow();
  });
  it('helps active allied construction once and makes future training research reduce its actual deadline', () => {
    const now = 1800000000000;
    let world = applySharedCommand(
      createSharedWorld(now),
      'alice',
      { type: 'join', name: 'النور' },
      now,
    );
    world = applySharedCommand(world, 'bob', { type: 'join', name: 'الصقر' }, now);
    world = structuredClone(world);
    const [a, b] = Object.values(world.game.villages);
    for (const v of [a, b]) {
      v.buildings.embassy = 1;
      v.buildings.barracks = 1;
      v.resources.gold = 500;
    }
    const send = (actor: string, command: unknown) => {
      world = applySharedCommand(world, actor, command, now);
    };
    send('alice', { type: 'outpost', action: { type: 'allianceCreate', name: 'الفزعة' } });
    const id = world.game.players.alice.allianceId!;
    send('bob', { type: 'outpost', action: { type: 'allianceJoin', allianceId: id } });
    send('alice', { type: 'outpost', action: { type: 'allianceApprove', playerId: 'bob' } });
    send('bob', {
      type: 'outpost',
      action: { type: 'build', villageId: b.id, building: 'lumber' },
    });
    const item = world.game.villages[b.id].constructionQueue!.find((i) => i.status === 'BUILDING')!;
    const end = item.endsAt;
    expect(projectSharedWorld(world, 'alice', now).allianceHelp).toHaveLength(1);
    send('alice', { type: 'alliance-help', villageId: b.id, itemId: item.id });
    expect(world.game.villages[b.id].constructionQueue!.find((i) => i.id === item.id)!.endsAt).toBe(
      Math.max(now + 1000, end - 30000),
    );
    expect(() =>
      send('alice', { type: 'alliance-help', villageId: b.id, itemId: item.id }),
    ).toThrow();
    expect(() =>
      send('bob', { type: 'alliance-help', villageId: b.id, itemId: item.id }),
    ).toThrow();
    const baseline = applySharedCommand(
      world,
      'bob',
      { type: 'outpost', action: { type: 'train', villageId: b.id, unit: 'guard', count: 1 } },
      now,
    );
    send('alice', { type: 'alliance-donate', amount: 100 });
    send('alice', { type: 'alliance-research' });
    send('bob', {
      type: 'outpost',
      action: { type: 'train', villageId: b.id, unit: 'guard', count: 1 },
    });
    expect(world.game.villages[b.id].training!.endsAt).toBeLessThan(
      baseline.game.villages[b.id].training!.endsAt,
    );
    expect(advanceSharedWorld(world, now + 86400000).guilds![id].trainingLevel).toBe(1);
  });
});
