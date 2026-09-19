import { describe, expect, it } from 'vitest';
import { balootBidLabel, handFanDegrees, sortHandForDisplay } from './baloot-hand-display';

describe('handFanDegrees', () => {
  it('keeps a single card upright', () => {
    expect(handFanDegrees(0, 1)).toBe(0);
  });

  it('fans eight cards from the left down to the right up', () => {
    expect(handFanDegrees(0, 8)).toBeLessThan(0);
    expect(handFanDegrees(7, 8)).toBeGreaterThan(0);
    expect(handFanDegrees(3, 8)).toBeLessThan(0);
    expect(handFanDegrees(4, 8)).toBeGreaterThan(0);
  });
});

describe('sortHandForDisplay', () => {
  it('groups suits and puts high sun ranks first', () => {
    const sorted = sortHandForDisplay(
      [
        { rank: '7', suit: 'hearts' },
        { rank: 'A', suit: 'clubs' },
        { rank: '10', suit: 'hearts' },
        { rank: 'J', suit: 'spades' },
      ],
      { mode: 'sun' },
    );

    expect(sorted.map((card) => `${card.rank}-${card.suit}`)).toEqual([
      'J-spades',
      '10-hearts',
      '7-hearts',
      'A-clubs',
    ]);
  });

  it('copies the hand instead of sorting in place', () => {
    const cards = [
      { rank: '7' as const, suit: 'hearts' as const },
      { rank: 'A' as const, suit: 'spades' as const },
    ];
    const original = [...cards];
    sortHandForDisplay(cards, { mode: 'sun' });
    expect(cards).toEqual(original);
  });

  it('leads with the trump suit and uses hokum rank order inside it', () => {
    const sorted = sortHandForDisplay(
      [
        { rank: 'A', suit: 'spades' },
        { rank: '9', suit: 'hearts' },
        { rank: 'J', suit: 'hearts' },
        { rank: 'K', suit: 'hearts' },
      ],
      { mode: 'hokum', trump: 'hearts' },
    );

    expect(sorted.map((card) => `${card.rank}-${card.suit}`)).toEqual([
      'J-hearts',
      '9-hearts',
      'K-hearts',
      'A-spades',
    ]);
  });
});

describe('balootBidLabel', () => {
  it('names every server-authorized escalation action', () => {
    expect(balootBidLabel({ mode: 'accept' })).toBe('قبول');
    expect(balootBidLabel({ mode: 'double', play: 'open' })).toBe('دبل مكشوف (×2)');
    expect(balootBidLabel({ mode: 'triple' })).toBe('تريبل (×3)');
    expect(balootBidLabel({ mode: 'quadruple', play: 'open' })).toBe('فور مكشوف (×4)');
    expect(balootBidLabel({ mode: 'gahwa' })).toBe('قهوة');
  });
});
