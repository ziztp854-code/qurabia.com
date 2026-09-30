import { z } from 'zod';
import { kingdomsConfigSchema, resourcesSchema } from './config';
export const worldIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const keySchema = z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/);
export const commandRequestSchema = z
  .object({ worldId: worldIdSchema, idempotencyKey: keySchema, command: z.unknown() })
  .strict();
const common = { worldId: worldIdSchema, idempotencyKey: keySchema };
export const adminRequestSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create'),
      idempotencyKey: keySchema,
      name: z.string().trim().min(2).max(80),
      config: kingdomsConfigSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal('configure'), ...common, config: kingdomsConfigSchema }).strict(),
  z.object({ action: z.literal('pause'), ...common, paused: z.boolean() }).strict(),
  z
    .object({
      action: z.literal('grant'),
      ...common,
      playerId: worldIdSchema,
      resources: resourcesSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('season'),
      ...common,
      endsAt: z.number().int().min(0).max(8_000_000_000_000),
    })
    .strict(),
]);
