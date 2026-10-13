import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { createWorld, executeCommand, advanceWorld } from './engine';
import { commandKingdomWorld } from './repository';
import { stableFingerprint } from './http';
import { farmQuote, gardenProgress, farmState } from './sultan-farm';

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => {
    throw new Error('Injected test DB required');
  },
}));
const at = 1700000000000;
function fixture() {
  const state = executeCommand(
    createWorld(at),
    'owner',
    { type: 'found', name: 'مملكة الاختبار' },
    at,
  );
  const villageId = Object.keys(state.villages)[0];
  state.villages[villageId].buildings.farm = 1;
  const row = { id: 'world', name: 'test', revision: 4, paused: false, state };
  const tx = {
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([{ now: new Date(at) }]),
    kingdomReportEntry: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id: string) => ({id}))),
      findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', tokenVersion: 1, role: 'USER' }),
    },
    kingdomCommand: {
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({}),
    },
    kingdomWorld: {
      update: vi
        .fn()
        .mockImplementation(async ({ data }) => ({ ...row, state: data.state, revision: 5 })),
    },
  };
  const transaction = vi.fn(async (work: (client: typeof tx) => unknown) => work(tx));
  const db = { $transaction: transaction } as unknown as DatabaseClient;
  const command = {
    type: 'farmPlant' as const,
    villageId,
    plotId: 0,
    expectedVersion: 0,
    crop: 'wheat' as const,
    expectedQuote: farmQuote(state.config, 1, 'wheat').quoteKey,
  };
  return { row, tx, db, transaction, command };
}
describe('Farm commands reuse the existing atomic repository boundary', () => {
  it('locks the world, reauthorizes after lock and freezes timestamps from the DB clock before saving receipt', async () => {
    const { tx, db, transaction, command } = fixture();
    await commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'farm-key', command, db);
    const lockSql = (tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(lockSql).toContain('FOR UPDATE');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.user.findUnique.mock.invocationCallOrder[0],
    );
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'ReadCommitted',
      maxWait: 5000,
      timeout: 15000,
    });
    const saved = tx.kingdomWorld.update.mock.calls[0][0].data.state;
    expect(saved.villages[command.villageId].sultanFarm.plots[0].plant.plantedAt).toBe(at);
    expect(tx.kingdomWorld.update.mock.invocationCallOrder[0]).toBeLessThan(
      tx.kingdomCommand.create.mock.invocationCallOrder[0],
    );
    expect(tx.kingdomCommand.create).toHaveBeenCalledWith({
      data: {
        worldId: 'world',
        actorId: 'owner',
        key: 'farm-key',
        fingerprint: stableFingerprint(command),
        revision: 5,
      },
    });
  });
  it('returns an existing matching receipt without another stock/state/receipt write', async () => {
    const { tx, db, command } = fixture();
    tx.kingdomCommand.findUnique.mockResolvedValue({
      fingerprint: stableFingerprint(command),
      revision: 4,
    });
    await commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'same-key', command, db);
    expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
    expect(tx.kingdomCommand.create).not.toHaveBeenCalled();
  });
  it('rejects changing a seed under an existing key', async () => {
    const { tx, db, command } = fixture();
    tx.kingdomCommand.findUnique.mockResolvedValue({
      fingerprint: stableFingerprint(command),
      revision: 4,
    });
    await expect(
      commandKingdomWorld(
        'world',
        { id: 'owner', tokenVersion: 1 },
        'same-key',
        { ...command, crop: 'beans' },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
  });
  it('rejects a revoked session after acquiring the world lock', async () => {
    const { tx, db, command } = fixture();
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', tokenVersion: 2, role: 'USER' });
    await expect(
      commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'farm-key', command, db),
    ).rejects.toMatchObject({ status: 401 });
    expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
    expect(tx.kingdomCommand.create).not.toHaveBeenCalled();
  });
  it('rejects farm mutations while paused and enforces the existing rate limit', async () => {
    const paused = fixture();
    paused.row.paused = true;
    await expect(
      commandKingdomWorld(
        'world',
        { id: 'owner', tokenVersion: 1 },
        'farm-key',
        paused.command,
        paused.db,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const limited = fixture();
    limited.tx.kingdomCommand.count.mockResolvedValue(30);
    await expect(
      commandKingdomWorld(
        'world',
        { id: 'owner', tokenVersion: 1 },
        'farm-key',
        limited.command,
        limited.db,
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(paused.tx.kingdomWorld.update).not.toHaveBeenCalled();
    expect(limited.tx.kingdomWorld.update).not.toHaveBeenCalled();
  });
});

/** An isolated transaction double: serial lock waiters see their predecessor's committed row. */
function concurrentFixture(legacy = false) {
  const f = fixture();
  f.row.state = executeCommand(f.row.state, 'owner', f.command, at);
  const plant = f.row.state.villages[f.command.villageId].sultanFarm!.plots[0].plant!;
  if (legacy) Object.assign(plant, { policyVersion: 1, seedFood: 10.125, harvestFood: 42.375 });
  const now = plant.readyAt;
  const receipts = new Map<string, { fingerprint: string; revision: number }>();
  const tx = {
    $queryRaw: vi.fn(async (sql: TemplateStringsArray) =>
      sql.join('?').includes('FOR UPDATE') ? [f.row] : [{ now: new Date(now) }],
    ),
    user: f.tx.user,
    kingdomReportEntry: f.tx.kingdomReportEntry,
    kingdomCommand: {
      findUnique: vi.fn(
        async ({ where }: { where: { worldId_actorId_key: { key: string } } }) =>
          receipts.get(where.worldId_actorId_key.key) ?? null,
      ),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(
        async ({ data }: { data: { key: string; fingerprint: string; revision: number } }) => {
          receipts.set(data.key, data);
          return data;
        },
      ),
    },
    kingdomWorld: {
      update: vi.fn(async ({ data }: { data: { state: typeof f.row.state } }) => {
        f.row.state = data.state;
        f.row.revision++;
        return { ...f.row };
      }),
    },
  };
  let tail: Promise<unknown> = Promise.resolve();
  const db = {
    $transaction: (work: (client: typeof tx) => unknown) => {
      const pending = tail.then(() => work(tx));
      tail = pending.catch(() => undefined);
      return pending;
    },
  } as unknown as DatabaseClient;
  const command = {
    type: 'farmHarvest' as const,
    villageId: f.command.villageId,
    plotId: 0,
    expectedVersion: 1,
  };
  return { row: f.row, tx, db, command, now };
}
describe('Concurrent garden collection through the existing repository', () => {
  it('pays a frozen legacy contract once across retry and distinct concurrent keys', async () => {
    const f = concurrentFixture(true);
    const before = advanceWorld(f.row.state, f.now).villages[f.command.villageId].resources.food;
    const results = await Promise.allSettled([
      commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'legacy-a', f.command, f.db),
      commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'legacy-b', f.command, f.db),
      commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'legacy-a', f.command, f.db),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(f.tx.kingdomWorld.update).toHaveBeenCalledTimes(1);
    expect(f.tx.kingdomCommand.create).toHaveBeenCalledTimes(1);
    const village = f.row.state.villages[f.command.villageId];
    expect(village.resources.food).toBeCloseTo(before + 42.375, 6);
    expect(farmState(village).plots[0]).toEqual({ version: 2, previousFamily: 'grain' });
    expect(gardenProgress(farmState(village)).harvests).toBe(0);
  });
  it('same request key returns the saved receipt; progress and badges are credited once', async () => {
    const f = concurrentFixture();
    await Promise.all([
      commandKingdomWorld(
        'world',
        { id: 'owner', tokenVersion: 1 },
        'harvest-key',
        f.command,
        f.db,
      ),
      commandKingdomWorld(
        'world',
        { id: 'owner', tokenVersion: 1 },
        'harvest-key',
        f.command,
        f.db,
      ),
    ]);
    expect(f.tx.kingdomWorld.update).toHaveBeenCalledTimes(1);
    expect(f.tx.kingdomCommand.create).toHaveBeenCalledTimes(1);
    expect(gardenProgress(farmState(f.row.state.villages[f.command.villageId])).harvests).toBe(1);
    expect(
      f.row.state.players.owner.achievements.filter((id) => id === 'garden:first-bloom'),
    ).toHaveLength(1);
  });
  it('different request keys against one generation allow exactly one collection', async () => {
    const f = concurrentFixture();
    const results = await Promise.allSettled([
      commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'harvest-a', f.command, f.db),
      commandKingdomWorld('world', { id: 'owner', tokenVersion: 1 }, 'harvest-b', f.command, f.db),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(f.tx.kingdomWorld.update).toHaveBeenCalledTimes(1);
    expect(f.tx.kingdomCommand.create).toHaveBeenCalledTimes(1);
    expect(gardenProgress(farmState(f.row.state.villages[f.command.villageId])).harvests).toBe(1);
  });
});
