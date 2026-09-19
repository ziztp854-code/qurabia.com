import { describe, expect, it } from 'vitest';
import { formatNumber } from './utils';

describe('formatNumber', () => {
  it('formats a single number with Latin digits', () => {
    expect(formatNumber(2)).toBe('2');
  });

  it('groups thousands with Latin separators', () => {
    expect(formatNumber(2_450)).toBe('2,450');
  });

  it('preserves fixed-width counters through display options', () => {
    expect(formatNumber(1, { minimumIntegerDigits: 2, useGrouping: false })).toBe('01');
  });

  it('applies fractional display options', () => {
    expect(formatNumber(12.5, { maximumFractionDigits: 1 })).toBe('12.5');
  });
});
