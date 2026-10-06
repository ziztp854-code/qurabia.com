import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { createWorld, executeCommand } from './engine';
import { readSiegeWorkshop, commandSiegeWorkshop } from './siege-workshop-repository';
import { provisionVillageGeography } from '../mamluk-map/village-geography';

const now = 1800000000000;
function database(damaged = false) {
  const found = executeCommand(
    executeCommand(createWorld(now), 'alice', { type: 'found', name: 'ألف' }, now),
    'bob',
    { type: 'found', name: 'باء' },
    now,
  );
  const a = Object.values(found.villages).find((village) => village.ownerId === 'alice')!;
  const b = Object.values(found.villages).find((village) => village.ownerId === 'bob')!;
  const geographic = provisionVillageGeography('world', found);
  let row = {
    id: 'world',
    name: 'العالم',
    revision: 8,
    paused: false,
    state: {
      ...geographic,
      extension: { preserved: true },
      villages: {
        ...found.villages,
        [a.id]: {
          ...a,
          buildings: { ...a.buildings, hall: 6, warehouse: 10 },
          resources: { wood: 10000, stone: 10000, iron: 10000, food: 10000, gold: 10000 },
          palaceGarden: { version: 1, slots: [{ slotId: 0, itemId: 'red-roses' }] },
          ...(damaged
            ? {
                siegeWorkshop: {
                  version: 1 as const,
                  level: 1,
                  inventory: { catapult: 0, ballista: 0, 'siege-tower': 0 },
                  damaged: { catapult: 1, ballista: 0, 'siege-tower': 0 },
                  queue: [],
                  receipts: [],
                },
              }
            : {}),
        },
      },
    },
    nextEventAt: new Date(found.season.endsAt),
  };
  let clock = now;
  let users = {
    alice: { status: 'ACTIVE', tokenVersion: 2 },
    bob: { status: 'ACTIVE', tokenVersion: 2 },
  };
  const receipts = new Map<string, { fingerprint: string; revision: number }>();
  const tx = {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: keyof typeof users } }) => users[where.id] ?? null,
      ),
    },
    $queryRaw: vi.fn(async (query: TemplateStringsArray) =>
      query.join('').includes('clock_timestamp')
        ? [{ now: new Date(clock) }]
        : [structuredClone(row)],
    ),
    kingdomCommand: {
      findUnique: vi.fn(async ({ where }: { where: { worldId_actorId_key: { key: string } } }) =>
        receipts.get(where.worldId_actorId_key.key),
      ),
      count: vi.fn(async () => 0),
      create: vi.fn(
        async ({ data }: { data: { key: string; fingerprint: string; revision: number } }) => {
          receipts.set(data.key, data);
          return data;
        },
      ),
    },
    kingdomWorld: {
      update: vi.fn(
        async ({ data }: { data: { state: typeof row.state; nextEventAt: Date | null } }) => {
          row = {
            ...row,
            state: structuredClone(data.state),
            nextEventAt: data.nextEventAt!,
            revision: row.revision + 1,
          };
          return structuredClone(row);
        },
      ),
    },
  };
  let turn: Promise<unknown> = Promise.resolve();
  const db = {
    $transaction: (work: (value: typeof tx) => unknown) => {
      const result = turn.then(() => work(tx));
      turn = result.catch(() => {});
      return result;
    },
  } as unknown as DatabaseClient;
  return {
    db,
    tx,
    a: a.id,
    b: b.id,
    snapshot: () => structuredClone(row),
    setClock: (value: number) => {
      clock = value;
    },
    queueSettlement: () => {
      row = {
        ...row,
        state: {
          ...row.state,
          movements: [
            ...row.state.movements,
            {
              id: 'due-settlement',
              ownerId: 'alice',
              sourceId: a.id,
              targetX: 20,
              targetY: 20,
              mission: 'settle',
              troops: { ...a.troops, settler: 1 },
              departedAt: now,
              arrivesAt: now + 1000,
              travelMs: 1000,
              loot: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
            },
          ],
        },
      };
    },
    revoke: () => {
      users = { ...users, alice: { status: 'ACTIVE', tokenVersion: 3 } };
    },
    pause: () => {
      row = { ...row, paused: true };
    },
    end: () => {
      row = { ...row, state: { ...row.state, season: { ...row.state.season, status: 'ended' } } };
    },
    impoverish: () => {
      row = {
        ...row,
        state: {
          ...row.state,
          villages: {
            ...row.state.villages,
            [a.id]: {
              ...row.state.villages[a.id],
              resources: { wood: 0, stone: 0, iron: 0, food: 0, gold: 0 },
            },
          },
        },
      };
    },
  };
}
const alice = { id: 'alice', tokenVersion: 2 };
describe('Owned server workshop persistence', () => {
  it('persists geographic allocation for a due settlement without moving existing villages', async () => {
    const data = database();
    const originalCities = data.snapshot().state.geography!.cities;
    data.queueSettlement();
    data.setClock(now + 1000);

    await readSiegeWorkshop('world', data.a, alice, data.db);

    const saved = data.snapshot().state;
    const settled = Object.values(saved.villages).find(
      (village) => village.x === 20 && village.y === 20,
    );
    expect(settled).toMatchObject({ ownerId: 'alice' });
    expect(saved.geography!.cities).toEqual(expect.arrayContaining([...originalCities]));
    expect(saved.geography!.cities).toContainEqual(expect.objectContaining({
      value: expect.objectContaining({ id: settled!.id, ownerPlayerId: 'alice', worldId: 'world' }),
    }));
    expect(saved.geography!.cities).toHaveLength(3);
  });
  it('reserves genuine damaged equipment, pays for repair and persists the restored inventory', async () => {
    const data = database(true);
    const repairing = await commandSiegeWorkshop(
      'world',
      data.a,
      alice,
      { type: 'repair', key: 'repair', equipment: 'catapult', count: 1 },
      data.db,
    );
    expect(repairing.resources.wood).toBe(9800);
    expect(repairing.damaged.catapult).toBe(0);
    expect(repairing.inventory.catapult).toBe(0);
    data.setClock(now + 300000);
    expect((await readSiegeWorkshop('world', data.a, alice, data.db)).inventory.catapult).toBe(1);
    expect((await readSiegeWorkshop('world', data.a, alice, data.db)).inventory.catapult).toBe(1);
  });
  it('builds, manufactures and reloads a real queue while preserving gardens and other villages', async () => {
    const data = database();
    await commandSiegeWorkshop(
      'world',
      data.a,
      alice,
      { type: 'upgrade', key: 'build-1' },
      data.db,
    );
    const crafting = await commandSiegeWorkshop(
      'world',
      data.a,
      alice,
      { type: 'craft', equipment: 'catapult', count: 1, key: 'craft-1' },
      data.db,
    );
    expect(crafting.inventory.catapult).toBe(0);
    expect(crafting.resources.wood).toBe(8800);
    data.setClock(now + 600000);
    const completed = await readSiegeWorkshop('world', data.a, alice, data.db);
    expect(completed.inventory.catapult).toBe(1);
    expect(completed.queue).toEqual([]);
    expect(data.snapshot().state.villages[data.a]).toMatchObject({
      palaceGarden: { version: 1, slots: [{ slotId: 0, itemId: 'red-roses' }] },
    });
    expect(data.snapshot().state.extension).toEqual({ preserved: true });
    expect(
      (await readSiegeWorkshop('world', data.b, { id: 'bob', tokenVersion: 2 }, data.db)).level,
    ).toBe(0);
  });
  it('denies another player and a session revoked during the lock wait', async () => {
    const data = database();
    await expect(
      readSiegeWorkshop('world', data.a, { id: 'bob', tokenVersion: 2 }, data.db),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      commandSiegeWorkshop(
        'world',
        data.a,
        { id: 'bob', tokenVersion: 2 },
        { type: 'upgrade', key: 'wrong-owner' },
        data.db,
      ),
    ).rejects.toMatchObject({ status: 403 });
    data.tx.$queryRaw.mockImplementationOnce(async () => {
      data.revoke();
      return [data.snapshot()];
    });
    await expect(
      commandSiegeWorkshop('world', data.a, alice, { type: 'upgrade', key: 'revoked' }, data.db),
    ).rejects.toMatchObject({ status: 401 });
    expect(data.snapshot().revision).toBe(8);
  });
  it('serializes competing purchases, prevents overdraft and rejects conflicting retry keys', async () => {
    const data = database();
    const [one, duplicate] = await Promise.all([
      commandSiegeWorkshop('world', data.a, alice, { type: 'upgrade', key: 'same-key' }, data.db),
      commandSiegeWorkshop('world', data.a, alice, { type: 'upgrade', key: 'same-key' }, data.db),
    ]);
    expect(one.resources.wood).toBe(9600);
    expect(duplicate.level).toBe(1);
    expect(data.snapshot().revision).toBe(9);
    await expect(
      commandSiegeWorkshop(
        'world',
        data.a,
        alice,
        { type: 'craft', equipment: 'catapult', count: 1, key: 'same-key' },
        data.db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    data.impoverish();
    const poor = data.snapshot();
    await expect(
      commandSiegeWorkshop(
        'world',
        data.a,
        alice,
        { type: 'craft', equipment: 'catapult', count: 1, key: 'poor' },
        data.db,
      ),
    ).rejects.toThrow(/الموارد/);
    expect(data.snapshot()).toEqual(poor);
  });
  it('deducts from elapsed production and preserves existing construction/training data', async () => {
    const data = database();
    data.impoverish();
    data.setClock(now + 72000000);
    const original = data.snapshot();
    const built = await commandSiegeWorkshop(
      'world',
      data.a,
      alice,
      { type: 'upgrade', key: 'accrued' },
      data.db,
    );
    expect(built.level).toBe(1);
    expect(built.resources.wood).toBeGreaterThanOrEqual(0);
    expect(data.snapshot().state.villages[data.b].buildings).toEqual(
      original.state.villages[data.b].buildings,
    );
    expect(data.snapshot().state.villages[data.a]).toMatchObject({
      palaceGarden: { version: 1, slots: [{ slotId: 0, itemId: 'red-roses' }] },
    });
  });
  it('preserves paused queues and rejects fresh orders during pause or ended season', async () => {
    const paused = database();
    await commandSiegeWorkshop(
      'world',
      paused.a,
      alice,
      { type: 'upgrade', key: 'build' },
      paused.db,
    );
    await commandSiegeWorkshop(
      'world',
      paused.a,
      alice,
      { type: 'craft', equipment: 'catapult', count: 1, key: 'craft' },
      paused.db,
    );
    paused.pause();
    paused.setClock(now + 700000);
    const queue = await readSiegeWorkshop('world', paused.a, alice, paused.db);
    expect(queue.inventory.catapult).toBe(0);
    expect(queue.queue).toHaveLength(1);
    await expect(
      commandSiegeWorkshop('world', paused.a, alice, { type: 'upgrade', key: 'pause' }, paused.db),
    ).rejects.toMatchObject({ status: 409 });
    const ended = database();
    ended.end();
    await expect(
      commandSiegeWorkshop('world', ended.a, alice, { type: 'upgrade', key: 'ended' }, ended.db),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not allow repairs to manufacture equipment that has never been damaged', async () => {
    const data = database();
    await commandSiegeWorkshop('world', data.a, alice, { type: 'upgrade', key: 'build' }, data.db);
    const original = data.snapshot();
    await expect(
      commandSiegeWorkshop(
        'world',
        data.a,
        alice,
        { type: 'repair', equipment: 'catapult', count: 1, key: 'phantom' },
        data.db,
      ),
    ).rejects.toThrow(/متضررة/);
    expect(data.snapshot()).toEqual(original);
  });
});
