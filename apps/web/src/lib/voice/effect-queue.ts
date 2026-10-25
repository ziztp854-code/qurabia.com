import type { VoiceMessage } from './types';

export type GiftDisplay = { message: VoiceMessage; count: number };
const MAX_AGE = 15_000;
/** Presentation only. Receipts and payment authority remain on the server. */
export class GiftEffectQueue {
  private seen = new Map<string, number>();
  private pending: GiftDisplay[] = [];
  private combos = new Map<string, { at: number; count: number }>();

  ingest(messages: VoiceMessage[], now: number, display = true) {
    for (const message of [...messages].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )) {
      if (!message.gift || this.seen.has(message.id)) continue;
      this.seen.set(message.id, message.createdAt);
      if (!display || now - message.createdAt > MAX_AGE || message.createdAt > now + 2000) continue;
      const key = `${message.userId}:${message.gift.recipientId}:${message.gift.id}`;
      const previous = this.combos.get(key);
      const count = previous && message.createdAt - previous.at <= 12_000 ? previous.count + 1 : 1;
      this.combos.set(key, { at: message.createdAt, count });
      const waiting = this.pending.find(
        (item) =>
          item.message.userId === message.userId &&
          item.message.gift?.recipientId === message.gift?.recipientId &&
          item.message.gift?.id === message.gift?.id,
      );
      if (waiting) waiting.count = count;
      else if (this.pending.length < 12) this.pending.push({ message, count });
    }
    for (const [key, combo] of this.combos) if (now - combo.at > MAX_AGE) this.combos.delete(key);
    // Entries outside this window cannot be displayed, even after history pruning/reconnect.
    for (const [id, at] of this.seen) if (now - at > MAX_AGE + 2000) this.seen.delete(id);
    if (!display) this.clear();
  }
  next(now: number) {
    this.pending = this.pending.filter((item) => now - item.message.createdAt <= MAX_AGE);
    return this.pending.shift() ?? null;
  }
  clear() {
    this.pending = [];
  }
}
