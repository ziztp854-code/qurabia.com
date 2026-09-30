import { z } from 'zod';
import { buildingKeys, unitKeys } from './types';
import { resourcesSchema } from './config';
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine((v) => !['__proto__', 'constructor', 'prototype'].includes(v));
const villageId = id;
const name = z.string().trim().min(2).max(40);
const troops = z
  .object({
    guard: z.number().int().min(0).max(1e6),
    rider: z.number().int().min(0).max(1e6),
    scout: z.number().int().min(0).max(1e6),
    settler: z.number().int().min(0).max(1e6),
  })
  .strict();
export const kingdomsCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('found'), name }).strict(),
  z
    .object({
      type: z.literal('allianceEventClaim'),
      villageId,
      eventKey: z
        .string()
        .max(60)
        .regex(/^s[1-9]\d*-w\d+$/),
    })
    .strict(),
  z.object({ type: z.literal('build'), villageId, building: z.enum(buildingKeys) }).strict(),
  z
    .object({
      type: z.literal('train'),
      villageId,
      unit: z.enum(unitKeys),
      count: z.number().int().min(1).max(10000),
    })
    .strict(),
  z
    .object({
      type: z.literal('march'),
      villageId,
      targetX: z.number().int().min(-1000).max(1000),
      targetY: z.number().int().min(-1000).max(1000),
      mission: z.enum(['attack', 'raid', 'scout', 'reinforce', 'settle', 'occupy', 'gather']),
      troops,
    })
    .strict(),
  z.object({ type: z.literal('recall'), villageId, hostVillageId: id }).strict(),
  z
    .object({
      type: z.literal('tradeOffer'),
      villageId,
      give: resourcesSchema,
      want: resourcesSchema,
    })
    .strict(),
  z.object({ type: z.literal('tradeAccept'), villageId, offerId: id }).strict(),
  z.object({ type: z.literal('tradeCancel'), offerId: id }).strict(),
  z.object({ type: z.literal('allianceCreate'), name }).strict(),
  z.object({ type: z.literal('allianceJoin'), allianceId: id }).strict(),
  z.object({ type: z.literal('allianceApprove'), playerId: id }).strict(),
  z.object({ type: z.literal('allianceReject'), playerId: id }).strict(),
  z.object({ type: z.literal('allianceKick'), playerId: id }).strict(),
  z
    .object({
      type: z.literal('allianceRole'),
      playerId: id,
      role: z.enum(['leader', 'officer', 'member']),
    })
    .strict(),
  z.object({ type: z.literal('allianceLeave') }).strict(),
  z
    .object({
      type: z.literal('diplomacy'),
      allianceId: id,
      status: z.enum(['war', 'peace', 'ally']),
    })
    .strict(),
  z
    .object({
      type: z.literal('claim'),
      mission: z.enum(['builder', 'commander', 'merchant', 'founder']),
    })
    .strict(),
  z.object({ type: z.literal('throne'), villageId, resources: resourcesSchema }).strict(),
]);
export type KingdomsCommand = z.infer<typeof kingdomsCommandSchema>;
