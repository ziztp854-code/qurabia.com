import { describe, expect, it } from 'vitest';
import { GiftEffectQueue } from './effect-queue';
import type { VoiceMessage } from './types';
const at = 10_000;
const gift = (id: string, createdAt = at, sender = 'a', giftId = 'rose'): VoiceMessage => ({
  id,
  createdAt,
  userId: sender,
  name: sender,
  image: null,
  text: '',
  replyTo: null,
  pinned: false,
  reactions: {},
  gift: { id: giftId as 'rose', recipientId: 'b', recipientName: 'المستقبل' },
});
describe('gift presentation queue', () => {
  it('orders a burst, merges matching gifts and preserves distinct senders/recipients', () => {
    const queue = new GiftEffectQueue();
    queue.ingest([gift('c', at + 2, 'c'), gift('b', at + 1), gift('a')], at + 2);
    expect(queue.next(at + 2)).toMatchObject({ message: { id: 'a' }, count: 2 });
    expect(queue.next(at + 2)).toMatchObject({ message: { id: 'c' }, count: 1 });
    expect(queue.next(at + 2)).toBeNull();
  });
  it('consumes initial history, duplicate polls, background events and stale reconnect data silently', () => {
    const queue = new GiftEffectQueue();
    queue.ingest([gift('history')], at, false);
    queue.ingest([gift('history'), gift('new')], at);
    expect(queue.next(at)?.message.id).toBe('new');
    queue.ingest([gift('new')], at + 3000);
    expect(queue.next(at + 3000)).toBeNull();
    queue.ingest([gift('old')], at + 20_000);
    expect(queue.next(at + 20_000)).toBeNull();
  });
  it('bounds overload, expires pending effects and carries combo counts across separate presentations', () => {
    const queue = new GiftEffectQueue();
    queue.ingest(
      Array.from({ length: 40 }, (_, i) => gift(`${i}`, at + i, `${i}`)),
      at + 40,
    );
    let shown = 0;
    while (queue.next(at + 40)) shown++;
    expect(shown).toBe(12);
    queue.ingest([gift('first', at + 50)], at + 50);
    queue.next(at + 50);
    queue.ingest([gift('again', at + 5050)], at + 5050);
    expect(queue.next(at + 5050)?.count).toBe(2);
    queue.ingest([gift('expired', at + 5100)], at + 5100);
    expect(queue.next(at + 30_000)).toBeNull();
  });
});
