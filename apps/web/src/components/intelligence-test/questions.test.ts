import { describe, expect, it } from 'vitest';
import { calculateResult, performanceLevel, QUESTIONS, SKILLS } from './questions';

describe('intelligence challenge scoring', () => {
  it('balances six questions per stage and two per skill in each stage', () => {
    expect(QUESTIONS).toHaveLength(18);
    for (const level of [1, 2, 3]) {
      for (const skill of SKILLS) {
        expect(QUESTIONS.filter((q) => q.level === level && q.skill === skill)).toHaveLength(2);
      }
    }
    for (const question of QUESTIONS) {
      expect(question.options).toHaveLength(4);
      expect(question.options[question.answer]).toBeTruthy();
      expect(new Set(question.options).size).toBe(4);
    }
  });
  it('scores all correct and all incorrect answers without an IQ estimate', () => {
    const perfect = calculateResult(QUESTIONS.map((q) => q.answer));
    expect(perfect).toMatchObject({
      correct: 18,
      points: 36,
      maximum: 36,
      score: 100,
      label: 'أداء متميز',
    });
    expect(perfect.skills.every((s) => s.correct === 6)).toBe(true);
    expect(calculateResult(QUESTIONS.map((q) => (q.answer + 1) % 4))).toMatchObject({
      correct: 0,
      score: 0,
      label: 'بداية للتدرّب',
    });
    expect(calculateResult([]).score).toBe(0);
  });
  it('weights advanced questions while preserving raw skill and stage totals', () => {
    const result = calculateResult(QUESTIONS.map((q) => (q.level === 3 ? q.answer : null)));
    expect(result).toMatchObject({ points: 18, score: 50, correct: 6 });
    expect(result.levels.map((l) => l.correct)).toEqual([0, 0, 6]);
    expect(result.skills.map((s) => s.correct)).toEqual([2, 2, 2]);
  });
  it.each([
    [39, 'بداية للتدرّب'],
    [40, 'أداء واعد'],
    [59, 'أداء واعد'],
    [60, 'أداء قوي'],
    [79, 'أداء قوي'],
    [80, 'أداء متميز'],
  ] as const)('classifies boundary %s', (score, label) => {
    expect(performanceLevel(score).label).toBe(label);
  });
});
