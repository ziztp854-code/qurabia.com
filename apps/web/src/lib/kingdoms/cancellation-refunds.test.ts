import { describe, expect, it } from 'vitest';
import { createWorld, executeCommand } from './engine';
import { resources } from './config';
import { capacity } from './simulation';
import { resourceKeys } from './types';

const at = 1_800_000_000_000;

describe('voluntary cancellations preserve the full refund', () => {
  it.each(['offer', 'caravan'] as const)(
    '%s keeps escrow until every refunded resource fits',
    (kind) => {
      let world = executeCommand(createWorld(at), 'alice', { type: 'found', name: 'النور' }, at);
      world = executeCommand(world, 'bob', { type: 'found', name: 'الفجر' }, at);
      const [origin, target] = Object.values(world.villages);
      origin.buildings.market = 1;
      origin.resources = resources(100, 100, 100, 100, 100);
      const refund = resources(10, 20, 30, 40, 50);
      world = executeCommand(
        world,
        'alice',
        kind === 'offer'
          ? { type: 'tradeOffer', villageId: origin.id, give: refund, want: resources(100) }
          : {
              type: 'caravanSend',
              villageId: origin.id,
              targetVillageId: target.id,
              resources: refund,
            },
        at,
      );
      const cancel =
        kind === 'offer'
          ? { type: 'tradeCancel' as const, offerId: world.offers[0].id }
          : { type: 'caravanCancel' as const, caravanId: world.caravans[0].id };
      const village = world.villages[origin.id];
      const limit = capacity(world, village);
      for (const key of resourceKeys) {
        village.resources = resources();
        village.resources[key] = limit - refund[key] + 1;
        const before = structuredClone(world);
        expect(() => executeCommand(world, 'alice', cancel, at)).toThrow(/سعة/);
        expect(world).toEqual(before);
      }
      village.resources = Object.fromEntries(
        resourceKeys.map((key) => [key, limit - refund[key]]),
      ) as typeof refund;
      const canceled = executeCommand(world, 'alice', cancel, at);
      expect(canceled.villages[origin.id].resources).toEqual(
        resources(limit, limit, limit, limit, limit),
      );
      expect(() => executeCommand(canceled, 'alice', cancel, at)).toThrow();
    },
  );
});
