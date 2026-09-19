import { describe, expect, it } from 'vitest';
import {
  buildMillionaireRun,
  MILLIONAIRE_LEVELS,
  MILLIONAIRE_QUESTION_BANK,
} from './millionaire-bank';

describe('millionaire question bank', () => {
  it('covers every millionaire level with valid answer options', () => {
    expect(MILLIONAIRE_QUESTION_BANK.length).toBeGreaterThanOrEqual(30);

    for (const [index, value] of MILLIONAIRE_LEVELS.entries()) {
      const level = index + 1;
      const questions = MILLIONAIRE_QUESTION_BANK.filter((question) => question.level === level);

      expect(questions.length).toBeGreaterThanOrEqual(2);
      for (const question of questions) {
        expect(question.value).toBe(value);
        expect(question.options).toHaveLength(4);
        expect(question.options[question.answerIndex]).toBeTruthy();
        expect(question.explanation.length).toBeGreaterThan(10);
      }
    }
  });

  it('builds one playable run across the 15-level ladder', () => {
    const run = buildMillionaireRun(1);

    expect(run).toHaveLength(15);
    expect(run.map((question) => question.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(run.at(-1)?.value).toBe(1000000);
  });
});
