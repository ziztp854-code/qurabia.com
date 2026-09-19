import { describe, expect, it } from 'vitest';
import {
  BOARD_LETTERS,
  getLetterQuestionStats,
  getQuestionForLetter,
  LETTER_QUESTIONS,
  LETTER_QUESTION_CATEGORIES,
  LETTER_QUESTION_PATTERNS,
  PATTERN_THRESHOLD,
} from './questions';

describe('letter challenge questions', () => {
  it('covers every board letter exactly once', () => {
    expect(LETTER_QUESTIONS).toHaveLength(BOARD_LETTERS.length);
    expect(new Set(LETTER_QUESTIONS.map((question) => question.letter)).size).toBe(
      BOARD_LETTERS.length,
    );
    for (const letter of BOARD_LETTERS) {
      expect(getQuestionForLetter(letter).letter).toBe(letter);
    }
  });

  it('keeps every answer anchored to its selected Arabic letter', () => {
    for (const question of LETTER_QUESTIONS) {
      expect(question.answer.startsWith(question.letter)).toBe(true);
      expect(question.prompt.length).toBeGreaterThan(20);
    }
  });

  it('assigns every question to exactly one declared category and pattern', () => {
    for (const question of LETTER_QUESTIONS) {
      expect(LETTER_QUESTION_CATEGORIES).toContain(question.category);
      expect(LETTER_QUESTION_PATTERNS).toContain(question.pattern);
    }
  });

  it('keeps the question bank free of duplicate answers within the same category', () => {
    const seen = new Map<string, string>();
    for (const question of LETTER_QUESTIONS) {
      const key = `${question.category}::${question.answer.toLowerCase()}`;
      expect(seen.get(key), `duplicate answer in ${question.category}: ${question.answer}`).toBeUndefined();
      seen.set(key, question.id);
    }
  });

  it('keeps every question-pattern share at or below the diversity threshold', () => {
    const stats = getLetterQuestionStats();
    for (const pattern of LETTER_QUESTION_PATTERNS) {
      expect(
        stats.patternShare[pattern],
        `pattern ${pattern} exceeded the ${PATTERN_THRESHOLD * 100}% threshold`,
      ).toBeLessThanOrEqual(PATTERN_THRESHOLD);
    }
  });

  it('exposes stats that match the question bank counts', () => {
    const stats = getLetterQuestionStats();
    expect(stats.total).toBe(LETTER_QUESTIONS.length);

    const countedCategories = Object.values(stats.byCategory).reduce((sum, n) => sum + n, 0);
    const countedPatterns = Object.values(stats.byPattern).reduce((sum, n) => sum + n, 0);
    expect(countedCategories).toBe(stats.total);
    expect(countedPatterns).toBe(stats.total);
  });
});
