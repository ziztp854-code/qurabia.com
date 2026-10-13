import { createWorld, executeCommand, projectWorld } from './engine';
import { report } from './simulation';
import { resources } from './config';
import { describe, it, expect } from 'vitest';
import { reportArchiveRows } from './reports-store';
describe('durable report identities', () => {
  it('does not collide when a world reset reuses a report sequence', () => {
    const rows = reportArchiveRows('world', [
      { id: 'r1', at: 1000, recipients: ['owner'], title: 'ميلاد المملكة', detail: 'قديم' },
      { id: 'r1', at: 2000, recipients: ['owner'], title: 'ميلاد المملكة', detail: 'جديد' },
    ]);
    expect(new Set(rows.map((r) => r.reportId)).size).toBe(2);
    expect(rows.map((r) => r.ordinal)).toEqual([1, 1]);
    expect(rows[0].payload).toMatchObject({ id: rows[0].reportId });
  });
  it('deduplicates recipients and excludes private transfer/commander details from payloads', () => {
    const rows = reportArchiveRows('world', [
      {
        id: 'r2',
        at: 1000,
        recipients: ['owner', 'owner'],
        title: 'تجارة',
        detail: 'حدث',
        event: {
          key: 'trade.completed',
          category: 'economy',
          commanders: [{ playerId: 'enemy', name: 'سر' }],
          transfers: [
            {
              playerId: 'enemy',
              sent: { wood: 1, stone: 0, iron: 0, food: 0, gold: 0 },
              received: { wood: 2, stone: 0, iron: 0, food: 0, gold: 0 },
            },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).not.toHaveProperty('recipients');
    expect(rows[0].payload).not.toHaveProperty('event.transfers');
    expect(rows[0].payload).toHaveProperty('event.commanders', []);
  });
  it('also strips private event metadata from the existing world projection', () => {
    const at = 1800000000000;
    const world = executeCommand(createWorld(at), 'owner', { type: 'found', name: 'المملكة' }, at);
    report(world, at, ['owner', 'enemy'], 'حدث', 'مشترك', {
      event: {
        key: 'trade.completed',
        category: 'economy',
        commanders: [
          { playerId: 'owner', name: 'قائد المملكة' },
          { playerId: 'enemy', name: 'قائد سري' },
        ],
        transfers: [
          { playerId: 'owner', sent: resources(10), received: resources(20) },
          { playerId: 'enemy', sent: resources(200), received: resources(100) },
        ],
      },
    });
    const projected = projectWorld(world, 'owner', at).reports.at(-1)!;
    expect(projected.recipients).toEqual(['owner']);
    expect(projected.event?.commanders).toEqual([{ playerId: 'owner', name: 'قائد المملكة' }]);
    expect(projected.event).not.toHaveProperty('transfers');
    expect(projected.event?.resources).toEqual({ sent: resources(10), received: resources(20) });
    expect(world.reports.at(-1)?.event?.commanders).toHaveLength(2);
  });
});
