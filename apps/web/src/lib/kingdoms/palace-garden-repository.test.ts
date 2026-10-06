import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { readPalaceGarden, savePalaceGarden } from './palace-garden-repository';
import { advanceWorld, createWorld, executeCommand } from './engine';

export function gardenDatabase() {
  let row = {
    id: 'world', revision: 8, paused: false, nextEventAt: new Date('2026-10-07'),
    state: { villages: {
      a: { id: 'a', ownerId: 'alice', resources: { gold: 321 }, build: { endsAt: 999 } },
      b: { id: 'b', ownerId: 'bob', resources: { gold: 456 } },
    }, movements: [{ id: 'march', arrivesAt: 888 }], extension: { preserved: true } },
  };
  const users = { alice: { status: 'ACTIVE', tokenVersion: 2 }, bob: { status: 'ACTIVE', tokenVersion: 2 } };
  const tx = {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: keyof typeof users } }) => users[where.id] ?? null) },
    $queryRaw: vi.fn(async () => [structuredClone(row)]),
    kingdomWorld: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === row.id ? structuredClone(row) : null),
      update: vi.fn(async ({ data }: { data: { state: typeof row.state } }) => {
        row = { ...row, state: structuredClone(data.state), revision: row.revision + 1 };
        return structuredClone(row);
      }),
    },
  };
  return { db: { $transaction: async (work: (value: typeof tx) => unknown) => work(tx) } as unknown as DatabaseClient, tx, users, snapshot: () => structuredClone(row) };
}

describe('Owned palace garden persistence', () => {
  it('preserves saved customization through ordinary engine commands and world ticks', () => {
    const now = 1_800_000_000_000;
    const founded = executeCommand(createWorld(now), 'alice', { type: 'found', name: 'حديقة الاختبار' }, now);
    const id = Object.keys(founded.villages)[0];
    const withGarden = { ...founded, villages: { ...founded.villages, [id]: {
      ...founded.villages[id], palaceGarden: { version: 1, slots: [{ slotId: 3, itemId: 'white-roses' }] },
    } } };
    const building = executeCommand(withGarden, 'alice', { type: 'build', villageId: id, building: 'farm' }, now);
    const completed = advanceWorld(building, now + 120_000);
    expect(completed.villages[id]).toMatchObject({ palaceGarden: { version: 1, slots: [{ slotId: 3, itemId: 'white-roses' }] } });
    expect(completed.villages[id].buildings.farm).toBe(1);
  });
  it('saves and reloads Alice garden without changing Bob garden or gameplay', async () => {
    const database = gardenDatabase();
    const original = database.snapshot();
    const alice = { id: 'alice', tokenVersion: 2 };
    expect((await readPalaceGarden('world', 'a', alice, database.db)).slots).toEqual([]);
    await savePalaceGarden('world', 'a', alice, [{ slotId: 0, itemId: 'red-roses' }], database.db);
    expect((await readPalaceGarden('world', 'a', alice, database.db)).slots).toEqual([{ slotId: 0, itemId: 'red-roses' }]);
    expect((await readPalaceGarden('world', 'b', { id: 'bob', tokenVersion: 2 }, database.db)).slots).toEqual([]);
    expect(database.snapshot().state.villages.b).toEqual(original.state.villages.b);
    expect(database.snapshot().state.villages.a.resources).toEqual({ gold: 321 });
    expect(database.snapshot().state.villages.a.build).toEqual({ endsAt: 999 });
    expect(database.snapshot().state.movements).toEqual(original.state.movements);
    expect(database.snapshot().state.extension).toEqual({ preserved: true });
    expect(database.snapshot().nextEventAt).toEqual(original.nextEventAt);
    expect(database.snapshot().revision).toBe(9);
  });

  it('denies another player reading or writing a village garden', async () => {
    const { db } = gardenDatabase();
    const bob = { id: 'bob', tokenVersion: 2 };
    await expect(readPalaceGarden('world', 'a', bob, db)).rejects.toMatchObject({ status: 403 });
    await expect(savePalaceGarden('world', 'a', bob, [], db)).rejects.toMatchObject({ status: 403 });
    expect((await readPalaceGarden('world', 'a', { id: 'alice', tokenVersion: 2 }, db)).slots).toEqual([]);
  });

  it('supports distinct player customizations and replacing only the selected garden', async () => {
    const { db } = gardenDatabase();
    const alice = { id: 'alice', tokenVersion: 2 }, bob = { id: 'bob', tokenVersion: 2 };
    await savePalaceGarden('world', 'a', alice, [{ slotId: 1, itemId: 'white-roses' }], db);
    await savePalaceGarden('world', 'b', bob, [{ slotId: 4, itemId: 'purple-flowers' }], db);
    await savePalaceGarden('world', 'a', alice, [], db);
    expect((await readPalaceGarden('world', 'a', alice, db)).slots).toEqual([]);
    expect((await readPalaceGarden('world', 'b', bob, db)).slots).toEqual([{ slotId: 4, itemId: 'purple-flowers' }]);
  });

  it('revalidates a session revoked while waiting for the world lock', async () => {
    const database = gardenDatabase();
    database.tx.$queryRaw.mockImplementationOnce(async () => {
      database.users.alice = { status: 'ACTIVE', tokenVersion: 3 };
      return [database.snapshot()];
    });
    await expect(savePalaceGarden('world', 'a', { id: 'alice', tokenVersion: 2 }, [], database.db))
      .rejects.toMatchObject({ status: 401 });
    expect(database.snapshot().revision).toBe(8);
  });

  it.each([
    { slots: [{ slotId: -1, itemId: 'red-roses' }] },
    { slots: [{ slotId: 12, itemId: 'red-roses' }] },
    { slots: [{ slotId: 0, itemId: 'https://evil.test/image' }] },
    { slots: [{ slotId: 0, itemId: 'red-roses' }, { slotId: 0, itemId: 'white-roses' }] },
    { slots: [{ slotId: 0, itemId: 'red-roses', x: 0.1 }] },
  ])('rejects placements outside the fixed catalog and layout %j', async ({ slots }) => {
    const database = gardenDatabase();
    await expect(savePalaceGarden('world', 'a', { id: 'alice', tokenVersion: 2 }, slots, database.db))
      .rejects.toBeDefined();
    expect(database.snapshot().revision).toBe(8);
  });

  it('denies suspended accounts, unknown worlds and prototype village identifiers', async () => {
    const database = gardenDatabase();
    const alice = { id: 'alice', tokenVersion: 2 };
    await expect(readPalaceGarden('missing', 'a', alice, database.db)).rejects.toMatchObject({ status: 404 });
    await expect(readPalaceGarden('world', '__proto__', alice, database.db)).rejects.toMatchObject({ status: 403 });
    database.users.alice = { status: 'SUSPENDED', tokenVersion: 2 };
    await expect(readPalaceGarden('world', 'a', alice, database.db)).rejects.toMatchObject({ status: 401 });
    await expect(savePalaceGarden('world', 'a', alice, [], database.db)).rejects.toMatchObject({ status: 401 });
  });
});
