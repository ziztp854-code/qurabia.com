import { z } from 'zod';

const cfgId = z.number().int().positive().max(2_147_483_647);
const cell = z.number().int().min(0).max(35);
const node = z.string().min(1).max(80);
const route = { from: node, to: node };

export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('claim-quest'),
    questId: z.enum(['daily-attendance', 'road-104', 'road-301']),
  }),
  z.strictObject({ type: z.literal('recruit'), cfgId }),
  z.strictObject({ type: z.literal('move'), from: cell, to: cell }),
  z.strictObject({ type: z.literal('merge'), from: cell, to: cell }),
  z.strictObject({ type: z.literal('build'), cfgId, cell }),
  z.strictObject({ type: z.literal('upgrade-building'), cell }),
  z.strictObject({ type: z.literal('upgrade-castle') }),
  z.strictObject({ type: z.literal('collect') }),
  z.strictObject({ type: z.literal('tower-start'), levelId: z.number().int().min(1).max(65) }),
  z.strictObject({ type: z.literal('tower-route'), ...route }),
  z.strictObject({ type: z.literal('tower-disconnect'), ...route }),
  z.strictObject({ type: z.literal('tower-tick') }),
  z.strictObject({ type: z.literal('tower-quit') }),
]);

export const commandRequestSchema = z.strictObject({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  command: commandSchema,
});

export type CommandRequest = z.infer<typeof commandRequestSchema>;
