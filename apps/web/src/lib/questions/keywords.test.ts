import { describe, expect, it } from 'vitest';

import {
  clampKeywords,
  foldKeyword,
  isValidKeyword,
  keywordContainsFilter,
  MAX_KEYWORDS_PER_QUESTION,
  normalizeKeywords,
  uniqueKeywords,
} from './keywords';

describe('foldKeyword', () => {
  it('collapses alef variants to bare alef', () => {
    expect(foldKeyword('السعودية')).toBe('السعوديه');
  });
  it('drops diacritics and tatweel', () => {
    expect(foldKeyword('العَرَبِيَّةُ')).toBe('العربيه');
  });
  it('replaces punctuation with a space and keeps existing spaces', () => {
    expect(foldKeyword('السعودية، والرياض!')).toBe('السعوديه والرياض');
  });
});

describe('normalizeKeywords', () => {
  it('dedupes case-insensitively and trims whitespace', () => {
    const out = normalizeKeywords(['  السعودية  ', 'السعوديه', 'السعودية']);
    expect(out).toEqual([{ raw: 'السعودية', folded: 'السعوديه' }]);
  });

  it('preserves the first-seen casing', () => {
    const out = normalizeKeywords(['AI', 'ai', 'Ai']);
    expect(out[0]?.raw).toBe('AI');
  });

  it('drops empty inputs', () => {
    const out = normalizeKeywords(['', '   ', 'valid']);
    expect(out.map((entry) => entry.raw)).toEqual(['valid']);
  });
});

describe('isValidKeyword', () => {
  it('rejects empty and overlong values', () => {
    expect(isValidKeyword('')).toBe(false);
    expect(isValidKeyword('   ')).toBe(false);
    expect(isValidKeyword('a'.repeat(61))).toBe(false);
  });
  it('accepts a single-letter Arabic or Latin tag', () => {
    expect(isValidKeyword('ق')).toBe(true);
    expect(isValidKeyword('q')).toBe(true);
  });
});

describe('clampKeywords', () => {
  it('returns the input unchanged when under the limit', () => {
    expect(clampKeywords(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('truncates to the maximum after deduplication', () => {
    const many = Array.from({ length: MAX_KEYWORDS_PER_QUESTION + 5 }, (_, i) => `t${i}`);
    const out = clampKeywords(many);
    expect(out).toHaveLength(MAX_KEYWORDS_PER_QUESTION);
  });
});

describe('keywordContainsFilter', () => {
  it('returns undefined for empty input', () => {
    expect(keywordContainsFilter('')).toBeUndefined();
    expect(keywordContainsFilter('   ')).toBeUndefined();
  });
  it('truncates to the maximum length', () => {
    const tag = 'x'.repeat(120);
    expect(keywordContainsFilter(tag)).toHaveLength(60);
  });
});

describe('uniqueKeywords', () => {
  it('returns the normalised list in input order', () => {
    expect(uniqueKeywords(['B', 'a', 'A', 'b'])).toEqual(['B', 'a']);
  });
});
