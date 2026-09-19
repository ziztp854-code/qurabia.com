import { calculateClockOffset, getQuestionRemainingMs, getServerNow } from '@tahaddi/contracts';
import { describe, expect, it } from 'vitest';

describe('server clock synchronization', () => {
  it('accounts for half the measured round-trip time', () => {
    const offset = calculateClockOffset({
      clientSentAt: 1_000,
      clientReceivedAt: 1_100,
      serverTime: 1_040,
    });
    expect(offset).toBe(-10);
    expect(getServerNow(offset, 1_100)).toBe(1_090);
  });

  it('draws the remaining time locally without server countdown messages', () => {
    expect(getQuestionRemainingMs(10_000, 250, 8_500)).toBe(1_250);
    expect(getQuestionRemainingMs(10_000, 250, 10_000)).toBe(0);
  });
});
