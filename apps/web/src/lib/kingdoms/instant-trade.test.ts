import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand } from './engine';
import { kingdomsCommandSchema } from './commands';
import { resources } from './config';
import { capacity } from './simulation';
import { resourceKeys } from './types';

const at = 1800000000000;
function fixture() {
  const world = executeCommand(
    createWorld(at),
    'buyer',
    { type: 'found', name: 'مملكة السوق' },
    at,
  );
  const village = Object.values(world.villages)[0];
  village.buildings.market = 1;
  village.resources = resources(1500, 1500, 0, 1500, 1500);
  const command = {
    type: 'tradeInstant' as const,
    villageId: village.id,
    pay: 'food' as const,
    receive: 'iron' as const,
    amount: 1000,
  };
  return { world, village, command };
}

describe('instant market purchases', () => {
  it('delivers 1000 iron immediately for 1000 food and records actual transfers', () => {
    const { world, village, command } = fixture();
    const result = executeCommand(world, 'buyer', command, at);
    expect(result.villages[village.id].resources).toEqual(resources(1500, 1500, 1000, 500, 1500));
    expect(result.offers).toEqual([]);
    expect(result.caravans).toEqual([]);
    expect(result.reports.find((r) => r.event?.key === 'trade.instant')?.event?.resources).toEqual({
      sent: resources(0, 0, 0, 1000),
      received: resources(0, 0, 1000),
    });
    expect(world.villages[village.id].resources.iron).toBe(0);
    expect(result.players.buyer.achievements).not.toContain('merchant');
  });
  it.each(resourceKeys)('supports paying with %s at a server-controlled 1:1 rate', (pay) => {
    const { world, village, command } = fixture();
    village.resources = resources(1000, 1000, 1000, 1000, 1000);
    const receive = pay === 'wood' ? 'iron' : 'wood';
    const result = executeCommand(world, 'buyer', { ...command, pay, receive, amount: 100 }, at);
    expect(result.villages[village.id].resources[pay]).toBe(900);
    expect(result.villages[village.id].resources[receive]).toBe(1100);
  });
  it('rejects insufficient resources without changing the original world', () => {
    const { world, command } = fixture();
    const before = structuredClone(world);
    expect(() => executeCommand(world, 'buyer', { ...command, amount: 1600 }, at)).toThrow(
      'الموارد غير كافية',
    );
    expect(world).toEqual(before);
  });
  it('rejects storage overflow instead of charging for truncated delivery', () => {
    const { world, village, command } = fixture();
    village.resources.iron = capacity(world, village) - 999;
    const before = structuredClone(world);
    expect(() => executeCommand(world, 'buyer', command, at)).toThrow('لا تتسع المخازن');
    expect(world).toEqual(before);
    const result = executeCommand(world, 'buyer', { ...command, amount: 999 }, at);
    expect(result.villages[village.id].resources.iron).toBe(capacity(world, village));
  });
  it('requires a built market, ownership and distinct resources', () => {
    const { world, village, command } = fixture();
    expect(() => executeCommand(world, 'buyer', { ...command, receive: 'food' }, at)).toThrow(
      'موردين مختلفين',
    );
    expect(() => executeCommand(world, 'outsider', command, at)).toThrow();
    village.buildings.market = 0;
    expect(() => executeCommand(world, 'buyer', command, at)).toThrow('ابنِ السوق');
  });
  it.each([0, -1, 0.5, NaN, Infinity, 1e9 + 1])('rejects invalid quantity %s', (amount) => {
    expect(kingdomsCommandSchema.safeParse({ ...fixture().command, amount }).success).toBe(false);
  });
  it('rejects unknown resources and client supplied prices', () => {
    const { command } = fixture();
    expect(kingdomsCommandSchema.safeParse({ ...command, pay: 'silver' }).success).toBe(false);
    expect(kingdomsCommandSchema.safeParse({ ...command, cost: 1 }).success).toBe(false);
  });
});
