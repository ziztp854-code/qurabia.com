import { z } from 'zod';
import type { VoiceMessage, VoiceSnapshot } from '@/lib/voice/types';
const packetSchema = z
  .object({
    roomId: z.string().min(1).max(191),
    cursor: z.number().int().nonnegative(),
    message: z
      .object({
        id: z.string().min(1).max(191),
        userId: z.string().min(1).max(191),
        name: z.string().max(120),
        image: z.string().max(2048).nullable(),
        text: z.string().max(1000),
        createdAt: z.number().int().nonnegative(),
        replyTo: z.string().max(191).nullable(),
        pinned: z.boolean(),
        reactions: z.record(z.string().max(32), z.array(z.string().max(191)).max(500)),
        gift: z
          .object({
            id: z.enum(['rose', 'applause', 'star', 'crown']),
            recipientId: z.string().max(191),
            recipientName: z.string().max(120),
          })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict();
export type VoiceLiveMessage = { roomId: string; cursor: number; message: VoiceMessage };
export function readVoiceLiveMessage(bytes: Uint8Array, roomId: string): VoiceLiveMessage | null {
  if (bytes.length > 16_384) return null;
  try {
    const result = packetSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return result.success && result.data.roomId === roomId ? result.data : null;
  } catch {
    return null;
  }
}
/** A message delta never advances the authoritative seat/moderation snapshot cursor. */
export function withLiveMessages(
  snapshot: VoiceSnapshot,
  pending: VoiceLiveMessage[],
): VoiceSnapshot {
  if (!snapshot.me || !snapshot.room.active) {
    pending.length = 0;
    return snapshot;
  }
  const live = pending.filter(
    (event) => event.roomId === snapshot.room.id && event.cursor > snapshot.cursor,
  );
  pending.splice(0, pending.length, ...live.slice(-200));
  const ids = new Set(snapshot.messages.map((message) => message.id));
  const additional: VoiceMessage[] = [];
  for (const event of live) {
    if (ids.has(event.message.id)) continue;
    ids.add(event.message.id);
    additional.push(event.message);
  }
  return additional.length
    ? {
        ...snapshot,
        messages: [...snapshot.messages, ...additional]
          .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
          .slice(-200),
      }
    : snapshot;
}
