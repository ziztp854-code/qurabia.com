import { z } from 'zod';
import { VOICE_REACTIONS, VOICE_SEAT_LIMIT } from './contracts';

const base = {
  clientId: z.string().uuid(),
  cursor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
};
const memberId = z.string().uuid();
const simple = (type: 'join' | 'heartbeat' | 'leave' | 'request-seat' | 'release-seat' | 'close') =>
  z.object({ ...base, type: z.literal(type) }).strict();
export const voiceCommandSchema = z.discriminatedUnion('type', [
  simple('join'),
  simple('heartbeat'),
  simple('leave'),
  simple('request-seat'),
  simple('release-seat'),
  simple('close'),
  z.object({ ...base, type: z.literal('chat'), text: z.string().trim().min(1).max(500) }).strict(),
  z.object({ ...base, type: z.literal('reaction'), reaction: z.enum(VOICE_REACTIONS) }).strict(),
  z
    .object({
      ...base,
      type: z.literal('approve-seat'),
      memberId,
      seat: z
        .number()
        .int()
        .min(0)
        .max(VOICE_SEAT_LIMIT - 1),
    })
    .strict(),
  z.object({ ...base, type: z.literal('mute'), memberId, muted: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal('moderator'), memberId, enabled: z.boolean() }).strict(),
  z.object({ ...base, type: z.literal('remove'), memberId }).strict(),
  z.object({ ...base, type: z.literal('block'), memberId }).strict(),
  z
    .object({
      ...base,
      type: z.literal('signal'),
      targetMemberId: memberId,
      kind: z.enum(['offer', 'answer', 'ice']),
      payload: z.string().min(1).max(24_000),
    })
    .strict(),
]);

export const createVoiceRoomSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    imageUrl: z
      .string()
      .max(500)
      .regex(/^\/community-assets\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg)$/)
      .nullable()
      .optional(),
    clientId: z.string().uuid(),
  })
  .strict();

export const roomIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
