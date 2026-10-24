import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import {
  commandAlfazaaWorld,
  readAlfazaaWorld,
  WORLD_ID,
  type WorldAccountView,
} from './world-repository';
import { resources } from '../../kingdoms/config';
import type { SharedWorld } from '../realm/world-engine';

const url = process.env.ALFAZAA_TEST_DATABASE_URL;
describe.skipIf(!url)('Alfazaa shared-world PostgreSQL isolation', () => {
  let db: DatabaseClient;
  const users: string[] = [];
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
      parsed.port !== '55441' ||
      parsed.pathname !== '/alfazaa_world_test' ||
      parsed.search ||
      parsed.hash
    )
      throw new Error('Isolated local Alfazaa test database required');
    const { createPrismaClient } = await import('@tahaddi/database');
    db = createPrismaClient(url!);
    await db.$connect();
    // Explicit local test fixture only. Never fall back to DATABASE_URL.
    await db.$executeRaw`DELETE FROM "AlfazaaWorld" WHERE id=${WORLD_ID}`;
  });
  afterAll(async () => {
    if (!db) return;
    try {
      await db.$executeRaw`DELETE FROM "AlfazaaWorld" WHERE id=${WORLD_ID}`;
      await db.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await db.$disconnect();
    }
  });
  async function actor() {
    const id = `afz_world_${randomUUID()}`;
    users.push(id);
    await db.user.create({
      data: { id, name: 'اختبار عالم الفزعة', status: 'ACTIVE', tokenVersion: 0 },
    });
    return { id, tokenVersion: 0 };
  }
  async function send(
    identity: Awaited<ReturnType<typeof actor>>,
    command: unknown,
    key = randomUUID(),
  ) {
    const current = await readAlfazaaWorld(identity, db);
    return (await commandAlfazaaWorld(
      identity,
      { idempotencyKey: key, expectedRevision: current.revision, command },
      db,
    )) as WorldAccountView;
  }
  it('atomically spends city gold and troop once across duplicate requests and rejects stale/revoked sessions', async () => {
    const alice = await actor();
    await send(alice, { type: 'join', name: 'النور' });
    const initial = await readAlfazaaWorld(alice, db);
    const request = {
      idempotencyKey: randomUUID(),
      expectedRevision: initial.revision,
      command: { type: 'deposit-gold', amount: 100, expectedCityRevision: initial.city.revision },
    };
    const [first, retry] = (await Promise.all([
      commandAlfazaaWorld(alice, request, db),
      commandAlfazaaWorld(alice, request, db),
    ])) as WorldAccountView[];
    expect(first).toEqual(retry);
    expect(first.city.gold).toBe(initial.city.gold - 100);
    expect(Math.floor(first.world.villages[0].resources.gold)).toBe(100);
    const troop = first.city.troops.find((t) => t.conversion)!;
    const conversion = {
      idempotencyKey: randomUUID(),
      expectedRevision: first.revision,
      command: {
        type: 'convert-troop',
        cell: troop.cell,
        confirm: true,
        expectedCityRevision: first.city.revision,
      },
    };
    const converted = (await commandAlfazaaWorld(alice, conversion, db)) as WorldAccountView;
    expect(converted.city.troops.some((t) => t.cell === troop.cell)).toBe(false);
    expect(await commandAlfazaaWorld(alice, conversion, db)).toEqual(converted);
    await expect(
      commandAlfazaaWorld(alice, { ...conversion, idempotencyKey: randomUUID() }, db),
    ).rejects.toMatchObject({ status: 409 });
    await db.user.update({ where: { id: alice.id }, data: { tokenVersion: 1 } });
    await expect(commandAlfazaaWorld(alice, conversion, db)).rejects.toMatchObject({ status: 401 });
  });
  it('keeps actual two-account trade escrow, alliance permissions and PvP return consistent', async () => {
    const alice = await actor(),
      bob = await actor();
    await send(alice, { type: 'join', name: 'الأولى' });
    await send(bob, { type: 'join', name: 'الثانية' });
    const [row] = await db.$queryRaw<
      { state: SharedWorld }[]
    >`SELECT state FROM "AlfazaaWorld" WHERE id=${WORLD_ID}`;
    const game = row.state;
    const a = Object.values(game.game.villages).find((v) => v.ownerId === alice.id)!;
    const b = Object.values(game.game.villages).find((v) => v.ownerId === bob.id)!;
    // Isolated fixture fast-forwards completed construction/protection, never production credentials.
    for (const v of [a, b]) {
      v.buildings.market = 1;
      v.buildings.embassy = 1;
      game.game.players[v.ownerId].protectionUntil = 0;
    }
    a.troops.guard = 50;
    await db.$executeRaw`UPDATE "AlfazaaWorld" SET state=${JSON.stringify(game)}::jsonb WHERE id=${WORLD_ID}`;
    await send(alice, { type: 'outpost', action: { type: 'allianceCreate', name: 'الفزعة' } });
    const alliance = (await readAlfazaaWorld(alice, db)).world.player!.allianceId!;
    await send(bob, { type: 'outpost', action: { type: 'allianceJoin', allianceId: alliance } });
    await expect(
      send(bob, { type: 'outpost', action: { type: 'allianceApprove', playerId: bob.id } }),
    ).rejects.toMatchObject({ status: 409 });
    await send(alice, { type: 'outpost', action: { type: 'allianceApprove', playerId: bob.id } });
    expect((await readAlfazaaWorld(bob, db)).world.player!.allianceId).toBe(alliance);
    await send(bob, { type: 'outpost', action: { type: 'allianceLeave' } });
    const offered = await send(alice, {
      type: 'outpost',
      action: {
        type: 'tradeOffer',
        villageId: a.id,
        give: resources(100),
        want: resources(0, 100),
      },
    });
    const offer = offered.world.offers.find((o) => o.ownerId === alice.id)!;
    const accepted = await send(bob, {
      type: 'outpost',
      action: { type: 'tradeAccept', villageId: b.id, offerId: offer.id },
    });
    expect(accepted.world.offers.some((o) => o.id === offer.id)).toBe(false);
    await expect(
      send(bob, {
        type: 'outpost',
        action: { type: 'tradeAccept', villageId: b.id, offerId: offer.id },
      }),
    ).rejects.toMatchObject({ status: 409 });
    await send(alice, {
      type: 'outpost',
      action: {
        type: 'march',
        villageId: a.id,
        targetX: b.x,
        targetY: b.y,
        mission: 'attack',
        troops: { ...a.troops, guard: 20 },
      },
    });
    // Persisted fixture deadlines are advanced without sleeping or changing the server clock.
    const [outbound] = await db.$queryRaw<
      { state: SharedWorld }[]
    >`SELECT state FROM "AlfazaaWorld" WHERE id=${WORLD_ID}`;
    outbound.state.game.movements = outbound.state.game.movements.map((m) => ({
      ...m,
      arrivesAt: Date.now() - 1000,
      travelMs: 1,
    }));
    await db.$executeRaw`UPDATE "AlfazaaWorld" SET state=${JSON.stringify(outbound.state)}::jsonb WHERE id=${WORLD_ID}`;
    const settled = await readAlfazaaWorld(alice, db);
    expect(settled.world.progress.victories).toBe(1);
    expect(settled.world.villages[0].troops.guard).toBeGreaterThan(30);
    expect((await readAlfazaaWorld(alice, db)).world.progress.victories).toBe(1);
    expect(
      (await readAlfazaaWorld(bob, db)).world.reports.some(
        (r) => r.event?.key === 'battle.resolved',
      ),
    ).toBe(true);
  });
});
