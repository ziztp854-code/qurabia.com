import { z } from 'zod';
import { heroBattleModes } from './hero-types';
const id = z.number().int().positive().max(2147483647);
const slot = z.number().int().min(0).max(4);
export const heroCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('hero-recruit'), heroId: id }),
  z.strictObject({
    type: z.literal('hero-train'),
    heroId: id,
    itemId: id,
    count: z.number().int().min(1).max(1000),
  }),
  z.strictObject({ type: z.literal('hero-star'), heroId: id }),
  z.strictObject({ type: z.literal('hero-skill'), heroId: id, slot, skillId: id.optional() }),
  z.strictObject({ type: z.literal('hero-skill-forget'), heroId: id, slot }),
  z.strictObject({
    type: z.literal('hero-formation'),
    heroIds: z.array(id).min(1).max(2),
    troopCells: z.array(z.number().int().min(0).max(35)).max(9),
    formationType: z.number().int().min(1).max(4).optional(),
  }),
  z.strictObject({ type: z.literal('hero-equip'), heroId: id, itemId: id }),
  z.strictObject({ type: z.literal('hero-craft-gear'), itemId: id }),
  z.strictObject({ type: z.literal('hero-equip-upgrade'), heroId: id }),
  z.strictObject({
    type: z.literal('hero-formation-upgrade'),
    formationType: z.number().int().min(1).max(4).optional(),
  }),
  z.strictObject({ type: z.literal('hero-fortify'), position: z.number().int().min(0).max(8) }),
  z.strictObject({ type: z.literal('hero-rest') }),
  z.strictObject({ type: z.literal('hero-battle'), mode: z.enum(heroBattleModes), stageId: id }),
]);
