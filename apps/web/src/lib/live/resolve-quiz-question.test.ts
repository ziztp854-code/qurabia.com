import { describe, expect, it } from 'vitest';
import { resolveQuizQuestion } from './resolve-quiz-question';

describe('resolveQuizQuestion', () => {
  it('applies quiz-specific duration and points overrides', () => {
    expect(
      resolveQuizQuestion({
        durationOverride: 45,
        pointsOverride: 1_600,
        question: { id: 'question-1', timeLimit: 20, basePoints: 1_000 },
      }),
    ).toEqual({ id: 'question-1', timeLimit: 45, basePoints: 1_600 });
  });

  it('falls back to the question defaults', () => {
    expect(
      resolveQuizQuestion({
        durationOverride: null,
        pointsOverride: null,
        question: { id: 'question-1', timeLimit: 20, basePoints: 1_000 },
      }),
    ).toEqual({ id: 'question-1', timeLimit: 20, basePoints: 1_000 });
  });
});
