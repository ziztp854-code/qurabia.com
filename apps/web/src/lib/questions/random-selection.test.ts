import { describe, expect, it } from 'vitest';
import { selectRandomQuestionIds, selectRandomQuestionsByDifficulty } from './random-selection';

describe('selectRandomQuestionIds', () => {
  it('returns a stable, unique sample from the full matching set and changes it for a new seed', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `question-${index + 1}`);
    const originalIds = [...ids];

    const firstSample = selectRandomQuestionIds(ids, 'sample-a', 40);
    const repeatedSample = selectRandomQuestionIds(ids, 'sample-a', 40);
    const nextSample = selectRandomQuestionIds(ids, 'sample-b', 40);

    expect(firstSample).toHaveLength(40);
    expect(new Set(firstSample)).toHaveLength(40);
    expect(firstSample).toEqual(repeatedSample);
    expect(nextSample).not.toEqual(firstSample);
    expect(firstSample.some((id) => Number(id.split('-')[1]) > 40)).toBe(true);
    expect(ids).toEqual(originalIds);
  });
});

describe('selectRandomQuestionsByDifficulty', () => {
  it('returns unique questions with the requested difficulty distribution', () => {
    const candidates = (['EASY', 'MEDIUM', 'HARD'] as const).flatMap((difficulty) =>
      Array.from({ length: 10 }, (_, index) => ({ id: `${difficulty}-${index}`, difficulty })),
    );

    const selected = selectRandomQuestionsByDifficulty(
      candidates,
      { EASY: 2, MEDIUM: 3, HARD: 4 },
      'builder-seed',
    );

    expect(selected).toHaveLength(9);
    expect(new Set(selected)).toHaveLength(9);
    expect(selected.filter((id) => id.startsWith('EASY-'))).toHaveLength(2);
    expect(selected.filter((id) => id.startsWith('MEDIUM-'))).toHaveLength(3);
    expect(selected.filter((id) => id.startsWith('HARD-'))).toHaveLength(4);
  });
});
