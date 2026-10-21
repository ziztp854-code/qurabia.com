import type { VoiceMessage, VoiceSnapshot } from '../api/contracts';

export const CHAT_HISTORY_LIMIT = 200;
export const MESSAGE_TOPIC = 'tahaddi-voice-message-v1';
export const REFRESH_TOPIC = 'tahaddi-voice-refresh-v1';
export type VoiceLivePacket = { roomId: string; cursor: number; message: VoiceMessage };

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max: number, min = 0): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const nullableString = (value: unknown, max: number) => value === null || string(value, max);
const gifts = new Set(['rose', 'applause', 'star', 'crown']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function isMessage(value: unknown): value is VoiceMessage {
  if (!record(value) || !string(value.id, 191, 1) || !string(value.userId, 191, 1) ||
      !string(value.name, 120) || !nullableString(value.image, 2048) ||
      !string(value.text, 1000) || !integer(value.createdAt) ||
      !nullableString(value.replyTo, 191) || typeof value.pinned !== 'boolean' ||
      !record(value.reactions)) return false;
  if (value.clientId !== undefined &&
      (!string(value.clientId, 36) || !uuid.test(value.clientId))) return false;
  const reactions = Object.entries(value.reactions);
  if (reactions.length > 20 || reactions.some(([emoji, users]) =>
    emoji.length > 42 || !Array.isArray(users) || users.length > 500 ||
    users.some((id) => !string(id, 191)))) return false;
  return value.gift === undefined || (record(value.gift) &&
    typeof value.gift.id === 'string' && gifts.has(value.gift.id) &&
    string(value.gift.recipientId, 191) && string(value.gift.recipientName, 120));
}

/** Only call after checking the LiveKit sender is the server, never another participant. */
export function readVoiceLivePacket(payload: Uint8Array, roomId: string): VoiceLivePacket | null {
  if (payload.byteLength > 16_384) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (!record(value) || value.roomId !== roomId || !integer(value.cursor) ||
        !isMessage(value.message)) return null;
    return { roomId, cursor: value.cursor, message: value.message };
  } catch { return null; }
}

export function readVoiceRefresh(payload: Uint8Array, roomId: string): boolean {
  if (payload.byteLength > 512) return false;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    return record(value) && value.roomId === roomId && integer(value.cursor);
  } catch { return false; }
}

/** Snapshots are authoritative for deletions, moderation, visibility and membership. */
export function mergeChat(
  snapshot: VoiceSnapshot | null,
  deliveries: readonly VoiceLivePacket[],
  blockedUserIds: readonly string[] = [],
): { messages: VoiceMessage[]; pending: VoiceLivePacket[] } {
  if (!snapshot?.me || !snapshot.room.active) return { messages: [], pending: [] };
  const blocked = new Set(blockedUserIds);
  const unique = new Map<string, VoiceLivePacket>();
  for (const packet of deliveries) {
    if (packet.roomId === snapshot.room.id && packet.cursor > snapshot.cursor &&
        !blocked.has(packet.message.userId)) unique.set(packet.message.id, packet);
  }
  const pending = [...unique.values()].sort((a, b) => a.cursor - b.cursor).slice(-CHAT_HISTORY_LIMIT);
  const messages = new Map<string, VoiceMessage>();
  for (const message of snapshot.messages) {
    if (!blocked.has(message.userId)) messages.set(message.id, message);
  }
  for (const packet of pending) {
    if (!messages.has(packet.message.id)) messages.set(packet.message.id, packet.message);
  }
  return {
    pending,
    messages: [...messages.values()]
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
      .slice(-CHAT_HISTORY_LIMIT),
  };
}

/** Keep one UUID per failed logical operation; remove only after an HTTP acknowledgement. */
export class ChatCommandIds {
  private commands = new Map<string, string>();
  constructor(private readonly createId: () => string) {}
  for(fingerprint: string) {
    const existing = this.commands.get(fingerprint);
    if (existing) return existing;
    if (this.commands.size >= 100) throw new Error('أعد محاولة الرسائل المعلّقة قبل إرسال المزيد.');
    const id = this.createId();
    this.commands.set(fingerprint, id);
    return id;
  }
  acknowledge(fingerprint: string, requestId: string) {
    if (this.commands.get(fingerprint) === requestId) this.commands.delete(fingerprint);
  }
}
