import { describe, expect, it } from 'vitest';
import { isClassicLiveQuizMode } from './classic-quiz-mode';

describe('isClassicLiveQuizMode', () => {
  it('allows only QUIZ packs for classic live broadcast', () => {
    expect(isClassicLiveQuizMode('QUIZ')).toBe(true);
    expect(isClassicLiveQuizMode('LADDER')).toBe(false);
    expect(isClassicLiveQuizMode('MILLIONAIRE')).toBe(false);
    expect(isClassicLiveQuizMode('LETTER_CHALLENGE')).toBe(false);
    expect(isClassicLiveQuizMode('CATEGORY_BOARD')).toBe(false);
  });
});
