import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '@tahaddi/database';
const notifications = vi.hoisted(() => vi.fn());
vi.mock('./realtime-notifications', () => ({ queueKingdomsNotification: notifications }));
import { commandKingdomWorld, readKingdomWorld, tickKingdomWorlds } from './repository';
import { createWorld } from './engine';
import { kingdomsCommandSchema } from './commands';
import { stableFingerprint } from './http';
const actor = { id: 'local_user', tokenVersion: 0 };
const command = { type: 'found', name: 'Local village' };
const now = 1_000_000;
function fixture(options: { rollback?: boolean; duplicate?: boolean; paused?: boolean } = {}) {
  let committed = false;
  const row = { id: 'world_1', name: 'Local', state: createWorld(now), revision: 7, paused: options.paused ?? false };
  const tx = {
    $queryRaw: vi.fn((parts: TemplateStringsArray) => Promise.resolve(parts.join('').includes('clock_timestamp') ? [{ now: new Date(now) }] : [row])),
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', tokenVersion: 0, role: 'USER' }) },
    kingdomWorld: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn(async ({ data }: { data: { state: unknown } }) => ({ ...row, state: data.state, revision: row.revision + 1 })),
    },
    kingdomCommand: {
      findUnique: vi.fn().mockResolvedValue(options.duplicate ? { fingerprint: stableFingerprint(kingdomsCommandSchema.parse(command)) } : null),
      count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}),
    },
  };
  const db = { $transaction: vi.fn(async (work: (transaction: typeof tx) => Promise<unknown>) => {
    const result = await work(tx);
    if (options.rollback) throw new Error('commit failed');
    committed = true;
    return result;
  }) } as unknown as DatabaseClient;
  notifications.mockImplementation(() => { expect(committed).toBe(true); });
  return { db, tx };
}
beforeEach(() => { notifications.mockReset(); });
describe('committed revision notifications', () => {
  it('queues a changed revision after transaction commit with its durable earliest deadline', async () => {
    const { db } = fixture();
    const result = await commandKingdomWorld('world_1', actor, 'new-command', command, db);
    expect(result.revision).toBe(8);
    expect(notifications).toHaveBeenCalledExactlyOnceWith({ worldId: 'world_1', revision: 8, nextEventAt: createWorld(now).season.endsAt });
  });
  it('does not publish on a commit failure', async () => {
    const { db } = fixture({ rollback: true });
    await expect(commandKingdomWorld('world_1', actor, 'new-command', command, db)).rejects.toThrow('commit failed');
    expect(notifications).not.toHaveBeenCalled();
  });
  it('does not publish rejected or duplicate commands', async () => {
    await expect(commandKingdomWorld('world_1', actor, 'rejected', command, fixture({ paused: true }).db)).rejects.toMatchObject({ status: 409 });
    await commandKingdomWorld('world_1', actor, 'duplicate', command, fixture({ duplicate: true }).db);
    expect(notifications).not.toHaveBeenCalled();
  });
  it('recovers a lost notification with one bounded metadata query for watched worlds', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'world_1', revision: 8 }]);
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      kingdomWorld: { findFirst: vi.fn().mockResolvedValue({ nextEventAt: new Date(2000) }), findMany },
    } as unknown as DatabaseClient;
    expect(await tickKingdomWorlds(db, ['world_1', 'world_1', 'world_2'])).toEqual({
      worlds: [], revisions: [{ id: 'world_1', revision: 8 }], nextEventAt: 2000,
    });
    expect(findMany).toHaveBeenCalledExactlyOnceWith({ where: { id: { in: ['world_1', 'world_2'] } }, select: { id: true, revision: true }, take: 512 });
    expect(notifications).not.toHaveBeenCalled();
  });
  it('reads never create broadcasts or writes even when projecting due state', async () => {
    const { db, tx } = fixture();
    await readKingdomWorld('world_1', actor, false, db);
    expect(tx.kingdomWorld.update).not.toHaveBeenCalled();
    expect(notifications).not.toHaveBeenCalled();
  });
});
