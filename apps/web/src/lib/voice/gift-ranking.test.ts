import { describe, expect, it } from 'vitest';
import { giftRanking } from './gift-ranking';
import type { VoiceMessage } from './types';

describe('giftRanking', () => {
  it('counts only visible gift messages by recipient and gift', () => {
    const gift = (id: string, recipientId: string, recipientName: string) =>
      ({ gift: { id, recipientId, recipientName } }) as VoiceMessage;
    const result = giftRanking([
      gift('rose', 'a', 'أحمد'),
      gift('star', 'b', 'بدر'),
      gift('rose', 'a', 'أحمد'),
      {} as VoiceMessage,
    ]);
    expect(result.guests.map((row) => [row.name, row.count])).toEqual([
      ['أحمد', 2],
      ['بدر', 1],
    ]);
    expect(result.gifts.map((row) => [row.id, row.count])).toEqual([
      ['rose', 2],
      ['star', 1],
    ]);
    expect(giftRanking([])).toEqual({ guests: [], gifts: [] });
  });
});
