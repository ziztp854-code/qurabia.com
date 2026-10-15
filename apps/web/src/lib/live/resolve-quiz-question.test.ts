import { describe, expect, it } from 'vitest';
import { resolveQuizQuestion } from './resolve-quiz-question';

describe('resolveQuizQuestion', () => {
  it('applies the duration override while enforcing the difficulty score', () => {
    expect(
      resolveQuizQuestion({
        durationOverride: 45,
        pointsOverride: 1_600,
        question: { id: 'question-1', timeLimit: 20, basePoints: 1_000, difficulty: 'EASY' },
      }),
    ).toEqual({ id: 'question-1', timeLimit: 45, basePoints: 500, difficulty: 'EASY' });
  });

  it('falls back to the question defaults', () => {
    expect(
      resolveQuizQuestion({
        durationOverride: null,
        pointsOverride: null,
        question: { id: 'question-1', timeLimit: 20, basePoints: 1_000, difficulty: 'MEDIUM' },
      }),
    ).toEqual({ id: 'question-1', timeLimit: 20, basePoints: 700, difficulty: 'MEDIUM' });
  });
});

describe('difficulty scores with speed scoring', () => {
  it.each([
    ['EASY', 500],
    ['MEDIUM', 700],
    ['HARD', 1000],
  ] as const)('%s uses %i points as its speed-scoring maximum', async (difficulty, maximum) => {
    const { calculateTimedScore } = await import('./engine');
    const question = resolveQuizQuestion({
      durationOverride: null,
      pointsOverride: 9999,
      question: { timeLimit: 20, basePoints: 9999, difficulty },
    });
    for (const [elapsed, ratio] of [
      [0, 1],
      [10000, 0.75],
      [20000, 0.5],
    ] as const) {
      expect(
        calculateTimedScore({
          basePoints: question.basePoints,
          timeLimitSeconds: 20,
          questionStartedAt: new Date(1000),
          receivedAt: new Date(1000 + elapsed),
          speedScoring: true,
        }),
      ).toBe(Math.round(maximum * ratio));
    }
  });
});
