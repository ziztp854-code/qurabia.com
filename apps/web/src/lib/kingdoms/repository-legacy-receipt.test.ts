import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
import { createWorld, executeCommand } from './engine';
import { kingdomsCommandSchema } from './commands';
import { stableFingerprint } from './http';
import { commandKingdomWorld } from './repository';

vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => {
    throw new Error('Expected injected database');
  },
}));

const start = 1_800_000_000_000;
const identity = { id: 'alice', tokenVersion: 2 };
const oldTroops = { guard: 10, rider: 2, scout: 1, settler: 0 };
const oldMarch = {
  type: 'march',
  villageId: 'v1',
  targetX: 2,
  targetY: 3,
  mission: 'attack',
  troops: oldTroops,
};
const oldIntercept = {
  type: 'caravanIntercept',
  villageId: 'v1',
  carrierId: 'carrier1',
  troops: oldTroops,
};
const tx = {
  $queryRaw: vi.fn(),
  user: { findUnique: vi.fn() },
  kingdomWorld: { update: vi.fn() },
  kingdomCommand: { findUnique: vi.fn(), create: vi.fn(), count: vi.fn() },
};
const db = {
  $transaction: vi.fn((work: (value: typeof tx) => unknown) => work(tx)),
} as unknown as DatabaseClient;

describe('replaying Kingdoms receipts created before troop expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = executeCommand(
      createWorld(start),
      'alice',
      { type: 'found', name: 'قرية محفوظة' },
      start,
    );
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 'world1', name: 'العالم', state, revision: 7, paused: false },
    ]);
    tx.$queryRaw.mockResolvedValueOnce([{ now: new Date(start + 3600000) }]);
    tx.user.findUnique.mockResolvedValue({ status: 'ACTIVE', tokenVersion: 2, role: 'USER' });
  });

  it.each([oldMarch, oldIntercept])(
    'replays the same historical $type without duplicate writes',
    async (command) => {
      tx.kingdomCommand.findUnique.mockResolvedValue({
        fingerprint: stableFingerprint(command),
        revision: 7,
      });
      const view = await commandKingdomWorld('world1', identity, 'same-key', command, db);
      expect(view.revision).toBe(7);
      expect(view.villages).toHaveLength(1);
      expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
      expect(tx.kingdomCommand.create).not.toHaveBeenCalled();
      expect(tx.kingdomCommand.count).not.toHaveBeenCalled();
    },
  );

  it.each([oldMarch, oldIntercept])(
    'rejects changing an original troop count on a historical $type key',
    async (command) => {
      tx.kingdomCommand.findUnique.mockResolvedValue({
        fingerprint: stableFingerprint(command),
        revision: 7,
      });
      await expect(
        commandKingdomWorld(
          'world1',
          identity,
          'same-key',
          {
            ...command,
            troops: { ...oldTroops, guard: 11 },
          },
          db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
      expect(tx.kingdomCommand.create).not.toHaveBeenCalled();
    },
  );

  it.each(['archer', 'mounted_archer', 'sultan_guard', 'siege_engineer', 'siege_tower'])(
    'rejects adding nonzero %s to a historical key',
    async (unit) => {
      tx.kingdomCommand.findUnique.mockResolvedValue({
        fingerprint: stableFingerprint(oldMarch),
        revision: 7,
      });
      await expect(
        commandKingdomWorld(
          'world1',
          identity,
          'same-key',
          {
            ...oldMarch,
            troops: { ...oldTroops, [unit]: 1 },
          },
          db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
      expect(tx.kingdomCommand.create).not.toHaveBeenCalled();
    },
  );

  it('continues to replay current nine-unit fingerprints', async () => {
    const command = kingdomsCommandSchema.parse({
      ...oldMarch,
      troops: { ...oldTroops, archer: 3 },
    });
    tx.kingdomCommand.findUnique.mockResolvedValue({
      fingerprint: stableFingerprint(command),
      revision: 7,
    });
    expect((await commandKingdomWorld('world1', identity, 'same-key', command, db)).revision).toBe(
      7,
    );
    expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
    expect(tx.kingdomCommand.create).not.toHaveBeenCalled();
  });
});
