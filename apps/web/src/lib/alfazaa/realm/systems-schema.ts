import { z } from 'zod';
const id = z.number().int().positive().max(2_147_483_647);
const count = z.number().int().min(1).max(100);
export const systemsCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('systems-research'), tree: z.enum(['college', 'science']), id }),
  z.strictObject({ type: z.enum(['systems-train', 'systems-heal']), cfgId: id, count }),
  z.strictObject({ type: z.literal('systems-deploy'), cfgId: id }),
  z.strictObject({
    type: z.literal('systems-use'),
    itemId: id,
    count,
    choice: z.number().int().min(0).max(999).optional(),
  }),
  z.strictObject({ type: z.literal('systems-craft'), recipeId: id, count }),
  z.strictObject({ type: z.literal('systems-buy'), offerId: id, count }),
  z.strictObject({ type: z.literal('systems-exchange'), itemId: id, count }),
  z.strictObject({ type: z.literal('systems-speedup'), jobId: id, itemId: id, count }),
  z.strictObject({
    type: z.literal('systems-claim'),
    family: z.enum(['main', 'road', 'plot', 'daily', 'milestone']),
    id,
  }),
  z.strictObject({ type: z.literal('systems-daily-box'), index: z.number().int().min(0).max(3) }),
  z.strictObject({ type: z.enum(['systems-beast-hatch', 'systems-beast-feed']), beastId: id }),
  z.strictObject({ type: z.literal('systems-destroyer-upgrade') }),
  z.strictObject({
    type: z.enum(['systems-relic-upgrade', 'systems-relic-equip', 'systems-relic-dismantle']),
    relicId: id,
  }),
  z.strictObject({
    type: z.literal('systems-event-claim'),
    eventId: z.enum(['daily-campaign', 'weekly-commander']),
    tier: z.number().int().min(0).max(4),
  }),
  z.strictObject({ type: z.literal('systems-tick') }),
]);
