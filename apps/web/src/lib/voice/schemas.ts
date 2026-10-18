import { z } from 'zod';
import { VOICE_CATEGORIES } from './types';
const id = z.string().min(1).max(160);
const seatIndex = z.number().int().min(0).max(15);
// Covers are served by our own asset/upload pipeline; remote URLs and SVG are excluded.
export const voiceCoverSchema = z
  .string()
  .max(300)
  .regex(
    /^\/(?:voice\/covers\/(?:studio|friends|coffee|gaming|oud|discussion|quiz)\.webp|api\/voice\/covers\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/,
  );
export const roomSettingsSchema = z.object({
  name: z.string().trim().min(3).max(90),
  description: z.string().trim().max(500).default(''),
  category: z.enum(VOICE_CATEGORIES).default('مجالس'),
  cover: voiceCoverSchema.default('/voice/covers/friends.webp'),
  seatCount: z.number().int().min(2).max(16).default(8),
  isPrivate: z.boolean().default(false),
  allowMicRequests: z.boolean().default(true),
  chatEnabled: z.boolean().default(true),
  moderatorsCanManage: z.boolean().default(true),
});
export const createRoomSchema = roomSettingsSchema
  .extend({ password: z.string().min(6).max(128).optional() })
  .strict()
  .superRefine((data, ctx) => {
    if (data.password && !data.isPrivate)
      ctx.addIssue({
        code: 'custom',
        message: 'Password requires a private room',
        path: ['password'],
      });
  });
export const updateRoomSchema = roomSettingsSchema
  .partial()
  .extend({ password: z.string().min(6).max(128).nullable().optional() })
  .strict();
export const joinRoomSchema = z
  .object({
    password: z.string().max(128).optional(),
    invite: z.string().min(24).max(100).optional(),
  })
  .strict();
export const voiceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('request-seat'), seatIndex: seatIndex.optional() }).strict(),
  z.object({ type: z.literal('approve-seat'), userId: id, seatIndex }).strict(),
  z.object({ type: z.literal('deny-seat'), userId: id }).strict(),
  z.object({ type: z.literal('leave-seat') }).strict(),
  z.object({ type: z.literal('hand'), raised: z.boolean() }).strict(),
  z.object({ type: z.literal('mute'), muted: z.boolean() }).strict(),
  z.object({ type: z.literal('moderator-mute'), userId: id, muted: z.boolean() }).strict(),
  z.object({ type: z.literal('lock-seat'), seatIndex, locked: z.boolean() }).strict(),
  z.object({ type: z.literal('remove'), userId: id }).strict(),
  z
    .object({
      type: z.literal('role'),
      userId: id,
      role: z.enum(['moderator', 'speaker', 'listener']),
    })
    .strict(),
  z
    .object({
      type: z.literal('message'),
      text: z.string().trim().min(1).max(1000),
      replyTo: id.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('reaction'),
      messageId: id,
      emoji: z.enum(['❤️', '👏', '😂', '🔥', '👍', '✨']),
    })
    .strict(),
  z.object({ type: z.literal('pin-message'), messageId: id, pinned: z.boolean() }).strict(),
  z.object({ type: z.literal('delete-message'), messageId: id }).strict(),
  z
    .object({
      type: z.literal('report'),
      messageId: id.optional(),
      userId: id.optional(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict(),
  z.object({ type: z.literal('close') }).strict(),
]);
export const preferencesActionSchema = z.union([
  z
    .object({ type: z.enum(['favorite', 'follow', 'block', 'mute']), id, enabled: z.boolean() })
    .strict(),
  z
    .object({
      type: z.literal('privacy'),
      privateProfile: z.boolean().optional(),
      notifyFavorites: z.boolean().optional(),
    })
    .strict(),
]);
