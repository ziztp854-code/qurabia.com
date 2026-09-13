import { describe, expect, it } from 'vitest';
import {
  selectRandomQuestionIds,
  selectRandomQuestionsByDifficulty,
  selectCategoryBalancedQuestions,
} from './random-selection';

describe('selectCategoryBalancedQuestions', () => {
  it('balances an unequal bank across every category without duplicates or mutation', () => {
    const candidates = ['science', 'history', 'sport', 'language'].flatMap((categoryId, group) =>
      Array.from({ length: group === 0 ? 100 : 5 }, (_, index) => ({
        id: `${categoryId}-${index}`,
        prompt: `${categoryId}-${index}`,
        categoryId,
      })),
    );
    const before = JSON.stringify(candidates);
    const selected = selectCategoryBalancedQuestions(candidates, 'balanced', 20);
    expect(selected).toHaveLength(20);
    expect(new Set(selected).size).toBe(20);
    for (const category of ['science', 'history', 'sport', 'language']) {
      expect(selected.filter((id) => id.startsWith(category))).toHaveLength(5);
    }
    expect(JSON.stringify(candidates)).toBe(before);
  });

  it('covers 20 distinct categories when there are more than 20 and fills sparse pools', () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      id: `q${index}`,
      prompt: `سؤال ${index}`,
      categoryId: `c${index}`,
    }));
    expect(selectCategoryBalancedQuestions(many, 'a', 20)).toHaveLength(20);
    expect(selectCategoryBalancedQuestions(many, 'a', 20)).not.toEqual(
      selectCategoryBalancedQuestions(many, 'b', 20),
    );
    expect(
      selectCategoryBalancedQuestions(
        [
          { id: 'one', prompt: 'الأول', categoryId: null },
          { id: 'two', prompt: 'الثاني', categoryId: 'c' },
        ],
        'a',
        20,
      ),
    ).toHaveLength(2);
  });

  it('does not select repeated Arabic question text stored under different IDs', () => {
    const selected = selectCategoryBalancedQuestions(
      [
        { id: 'one', prompt: 'ما عاصمة المملكة العربية السعودية؟', categoryId: 'geography' },
        { id: 'duplicate', prompt: 'مَا عَاصِمَةُ المملكة العربية السعودية ؟', categoryId: 'general' },
        { id: 'two', prompt: 'كم عدد أركان الإسلام؟', categoryId: 'religion' },
      ],
      'duplicates',
      20,
    );

    expect(selected).toHaveLength(2);
    expect(selected).toContain('two');
    expect(selected.filter((id) => id === 'one' || id === 'duplicate')).toHaveLength(1);
  });

  it('keeps scarce categories represented while removing repeated text', () => {
    const selected = selectCategoryBalancedQuestions(
      [
        { id: 'scarce', prompt: 'سؤال مشترك', categoryId: 'scarce' },
        { id: 'duplicate', prompt: 'سؤال مشترك', categoryId: 'rich' },
        { id: 'alternative', prompt: 'سؤال بديل', categoryId: 'rich' },
      ],
      'category-coverage',
      2,
    );

    expect(selected).toContain('scarce');
    expect(selected).toContain('alternative');
  });
});

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
      Array.from({ length: 10 }, (_, index) => ({
        id: `${difficulty}-${index}`,
        prompt: `${difficulty}-${index}`,
        difficulty,
      })),
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

  it('removes repeated text and already selected questions from a difficulty draw', () => {
    const selected = selectRandomQuestionsByDifficulty(
      [
        { id: 'selected', prompt: 'السؤال السابق', difficulty: 'EASY' },
        { id: 'same-as-selected', prompt: 'السُّؤال السّابق', difficulty: 'EASY' },
        { id: 'new', prompt: 'سؤال جديد', difficulty: 'EASY' },
      ],
      { EASY: 3, MEDIUM: 0, HARD: 0 },
      'exclude-existing',
      ['selected'],
    );

    expect(selected).toEqual(['new']);
  });

  it('fills difficulty counts when a duplicate prompt has a valid alternative assignment', () => {
    const selected = selectRandomQuestionsByDifficulty(
      [
        { id: 'easy-shared', prompt: 'مشترك', difficulty: 'EASY' },
        { id: 'easy-only', prompt: 'خاص بالسهل', difficulty: 'EASY' },
        { id: 'medium-shared', prompt: 'مشترك', difficulty: 'MEDIUM' },
      ],
      { EASY: 1, MEDIUM: 1, HARD: 0 },
      'difficulty-matching',
    );

    expect(selected).toHaveLength(2);
    expect(selected).toContain('easy-only');
    expect(selected).toContain('medium-shared');
  });
});
