import { describe, expect, it, vi } from 'vitest';
import { readAlfazaa, commandAlfazaa } from './repository';
import { database } from './test-database';

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => {
    throw new Error('Use isolated fixture');
  },
}));

const alice = { id: 'alice', tokenVersion: 0 };
const bob = { id: 'bob', tokenVersion: 0 };
const collect = {
  idempotencyKey: 'collect-0001',
  expectedRevision: 0,
  command: { type: 'collect' as const },
};

describe('Alfazaa account persistence', () => {
  it('starts independently for each account and never accepts a client-owned state', async () => {
    const { db } = database();
    const a = await readAlfazaa(alice, db);
    const b = await readAlfazaa(bob, db);
    expect(a.revision).toBe(0);
    expect(a.state.castleLevel).toBe(1);
    expect(a.state.version).toBe(2);
    expect(a.state.cells.filter(Boolean)).toHaveLength(3);
    expect(a.state.cells[35]).toMatchObject({ kind: 'building', cfgId: 40001 });
    expect(a.state).toEqual(b.state);
    await expect(commandAlfazaa(alice, { ...collect, userId: 'bob' }, db)).rejects.toThrow();
    expect((await readAlfazaa(bob, db)).revision).toBe(0);
  });
  it('saves a successful merge once, replays its exact receipt, and keeps the other account unchanged', async () => {
    const { db } = database();
    const request = { ...collect, command: { type: 'merge', from: 0, to: 1 } };
    const first = await commandAlfazaa(alice, request, db);
    expect(first.revision).toBe(1);
    expect(first.state.cells[0]).toBeNull();
    expect(first.state.cells.filter(Boolean)).toHaveLength(2);
    expect(await commandAlfazaa(alice, request, db)).toEqual(first);
    expect((await readAlfazaa(alice, db)).revision).toBe(1);
    expect((await readAlfazaa(bob, db)).state.cells.filter(Boolean)).toHaveLength(3);
  });
  it('rejects stale writes and changed commands that reuse a receipt key', async () => {
    const { db } = database();
    const request = { ...collect, command: { type: 'merge', from: 0, to: 1 } };
    await commandAlfazaa(alice, request, db);
    await expect(
      commandAlfazaa(alice, { ...request, command: { type: 'tower-start', levelId: 1 } }, db),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      commandAlfazaa(
        alice,
        {
          ...request,
          idempotencyKey: 'request-0002',
          command: { type: 'tower-start', levelId: 1 },
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readAlfazaa(alice, db)).revision).toBe(1);
    expect((await readAlfazaa(alice, db)).state.battle).toBeNull();
  });
  it('rechecks account revocation inside persistence before replaying a saved receipt', async () => {
    const { db, users } = database();
    const request = { ...collect, command: { type: 'merge', from: 0, to: 1 } };
    await commandAlfazaa(alice, request, db);
    users.get('alice')!.tokenVersion = 1;
    await expect(commandAlfazaa(alice, request, db)).rejects.toMatchObject({ status: 401 });
    await expect(readAlfazaa(alice, db)).rejects.toMatchObject({ status: 401 });
    await expect(readAlfazaa({ id: 'missing', tokenVersion: 0 }, db)).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rolls back rejected actions without charging resources or advancing the revision', async () => {
    const { db } = database();
    const before = await readAlfazaa(alice, db);
    await expect(commandAlfazaa(alice, collect, db)).rejects.toMatchObject({ status: 409 });
    expect(await readAlfazaa(alice, db)).toEqual(before);
    await expect(
      commandAlfazaa(alice, { ...collect, command: { type: 'recruit', cfgId: 2147483647 } }, db),
    ).rejects.toMatchObject({ status: 409 });
    expect(await readAlfazaa(alice, db)).toEqual(before);
  });
  it('collects using the database clock and persists earned resources', async () => {
    const { db, setNow } = database();
    const initial = await readAlfazaa(alice, db);
    setNow(160_000);
    const result = await commandAlfazaa(alice, collect, db);
    expect(result.state.balances['400001']).toBe(initial.state.balances['400001'] + 126);
    expect(result.state.lastCollectedAt).toBe(160_000);
    expect(await readAlfazaa(alice, db)).toEqual(result);
  });
  it('retains the latest 128 receipts per account and rejects stale writes after pruning', async () => {
    const { db } = database();
    const requests = Array.from({ length: 130 }, (_, index) => ({
      idempotencyKey: `retain-${String(index).padStart(4, '0')}`,
      expectedRevision: index,
      command: { type: 'tower-quit' },
    }));
    const otherReceipt = await commandAlfazaa(bob, requests[0], db);
    for (const request of requests) await commandAlfazaa(alice, request, db);
    await expect(commandAlfazaa(alice, requests[0], db)).rejects.toMatchObject({ status: 409 });
    await expect(commandAlfazaa(alice, requests[1], db)).rejects.toMatchObject({ status: 409 });
    expect((await commandAlfazaa(alice, requests[2], db)).revision).toBe(3);
    expect((await commandAlfazaa(alice, requests[129], db)).revision).toBe(130);
    expect(await commandAlfazaa(bob, requests[0], db)).toEqual(otherReceipt);
    expect((await readAlfazaa(alice, db)).revision).toBe(130);
  });
  it('persists the full daily reward once even when a later request uses a fresh receipt key', async () => {
    const { db } = database();
    const before = await readAlfazaa(alice, db);
    const request = {
      idempotencyKey: 'daily-claim-0001',
      expectedRevision: 0,
      command: { type: 'claim-quest', questId: 'daily-attendance' },
    };
    const granted = await commandAlfazaa(alice, request, db);
    expect(granted.state.balances).toEqual({
      ...before.state.balances,
      '400091': 5,
      '420001': 5,
      '110001': 220,
      '200127': 50,
    });
    expect(granted.state.quests.lastDailyClaimDay).not.toBeNull();
    expect(await commandAlfazaa(alice, request, db)).toEqual(granted);
    await expect(
      commandAlfazaa(
        alice,
        { ...request, idempotencyKey: 'daily-claim-0002', expectedRevision: 1 },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const stored = await readAlfazaa(alice, db);
    expect(stored.revision).toBe(1);
    expect(stored.state.balances).toEqual(granted.state.balances);
    expect((await readAlfazaa(bob, db)).state.quests.lastDailyClaimDay).toBeNull();
  });
});
