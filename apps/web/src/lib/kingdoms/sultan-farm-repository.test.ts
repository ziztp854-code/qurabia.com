import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { createWorld, executeCommand } from './engine';
import { commandKingdomWorld } from './repository';
import { stableFingerprint } from './http';
import { farmQuote } from './sultan-farm';

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
    user: {
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
