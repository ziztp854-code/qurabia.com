import { voiceGift } from './gifts';
import type { VoiceMessage } from './types';

/** Counts the gift messages visible in this snapshot, not a financial ledger. */
export function giftRanking(messages: VoiceMessage[]) {
  const guests = new Map<string, { id: string; name: string; count: number }>();
  const gifts = new Map<string, { id: string; name: string; count: number }>();
  for (const message of messages) {
    const gift = message.gift && voiceGift(message.gift.id);
    if (!gift || !message.gift) continue;
    const recipient = message.gift;
    const guest = guests.get(recipient.recipientId) ?? {
      id: recipient.recipientId,
      name: recipient.recipientName,
      count: 0,
    };
    guest.name = recipient.recipientName;
    guest.count++;
    guests.set(guest.id, guest);
    const entry = gifts.get(gift.id) ?? { id: gift.id, name: gift.name, count: 0 };
    entry.count++;
    gifts.set(entry.id, entry);
  }
  const order = <T extends { id: string; count: number }>(items: T[]) =>
    items.sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return { guests: order([...guests.values()]), gifts: order([...gifts.values()]) };
}
