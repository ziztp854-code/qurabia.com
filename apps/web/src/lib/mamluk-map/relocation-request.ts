import { z } from 'zod';
import { keySchema, worldIdSchema } from '../kingdoms/api-schema';

export const villageRelocationRequestSchema = z
  .object({
    worldId: worldIdSchema,
    villageId: worldIdSchema,
    idempotencyKey: keySchema,
    longitude: z.number().min(-179.9).max(179.9),
    latitude: z.number().min(-85).max(85),
  })
  .strict();
export type VillageRelocationRequest = z.infer<typeof villageRelocationRequestSchema>;
