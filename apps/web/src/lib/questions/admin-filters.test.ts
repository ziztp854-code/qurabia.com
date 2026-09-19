import { describe, expect, it } from 'vitest';
import {
  buildQuestionBankHref,
  buildPublishedGameQuestionWhere,
  buildQuestionWhere,
  parseQuestionBankFilters,
} from './admin-filters';

describe('admin question bank filters', () => {
  it('scopes search to the selected category', () => {
    const filters = parseQuestionBankFilters({
      category: 'cat_sports',
      q: 'كأس العالم',
    });

    expect(buildQuestionWhere(filters)).toEqual({
      categoryId: 'cat_sports',
      status: { in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
      prompt: { contains: 'كأس العالم', mode: 'insensitive' },
    });
  });

  it('searches the whole bank when all categories are selected', () => {
    const filters = parseQuestionBankFilters({ category: 'ALL', q: 'كأس العالم' });

    expect(buildQuestionWhere(filters)).toEqual({
      status: { in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
      prompt: { contains: 'كأس العالم', mode: 'insensitive' },
    });
  });

  it('supports uncategorized, status, difficulty, and game filters together', () => {
    const filters = parseQuestionBankFilters({
      category: 'UNCATEGORIZED',
      status: 'PUBLISHED',
      difficulty: 'HARD',
      game: 'MILLIONAIRE',
    });

    expect(buildQuestionWhere(filters)).toEqual({
      categoryId: null,
      status: 'PUBLISHED',
      difficulty: 'HARD',
      gameTypes: { has: 'MILLIONAIRE' },
    });
  });

  it('supports the dedicated كلمة وسؤال bank route', () => {
    const filters = parseQuestionBankFilters({ game: 'QUESTION_WORD', type: 'SHORT_ANSWER' });

    expect(buildQuestionWhere(filters)).toEqual({
      status: { in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
      type: 'SHORT_ANSWER',
      gameTypes: { has: 'QUESTION_WORD' },
    });
  });

  it('falls back safely for invalid query values', () => {
    expect(
      parseQuestionBankFilters({ status: 'DELETED', difficulty: 'IMPOSSIBLE', game: 'CHESS' }),
    ).toMatchObject({
      category: 'ALL',
      status: 'ALL',
      difficulty: 'ALL',
      game: 'ALL',
      type: 'ALL',
      time: 'ANY',
      keyword: '',
      page: 1,
      includeDescendants: false,
    });
  });

  it('preserves active filters when switching category or page', () => {
    const filters = parseQuestionBankFilters({
      category: 'cat_sports',
      q: 'كأس العالم',
      status: 'PUBLISHED',
      difficulty: 'MEDIUM',
      game: 'CATEGORY_BOARD',
      page: '3',
    });

    expect(buildQuestionBankHref(filters, { category: 'cat_geography', page: 1 })).toBe(
      '/admin/content?category=cat_geography&q=%D9%83%D8%A3%D8%B3+%D8%A7%D9%84%D8%B9%D8%A7%D9%84%D9%85&status=PUBLISHED&difficulty=MEDIUM&game=CATEGORY_BOARD',
    );
  });

  it('builds a shared published-category query for every game', () => {
    expect(buildPublishedGameQuestionWhere('cat_sports', 'CATEGORY_BOARD')).toEqual({
      categoryId: 'cat_sports',
      status: 'PUBLISHED',
      gameTypes: { has: 'CATEGORY_BOARD' },
    });
  });

  it('expands the search to a category subtree when requested', () => {
    const filters = parseQuestionBankFilters({
      category: 'cat_history',
      includeDescendants: '1',
    });
    expect(
      buildQuestionWhere(filters, { categoryIds: ['cat_history', 'cat_saudi', 'cat_modern'] }),
    ).toEqual({
      categoryId: { in: ['cat_history', 'cat_saudi', 'cat_modern'] },
      status: { in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
    });
  });

  it('filters by keyword and time bucket together', () => {
    const filters = parseQuestionBankFilters({
      keyword: 'السعودية',
      time: 'FAST',
    });
    expect(buildQuestionWhere(filters)).toEqual({
      status: { in: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
      timeLimit: { min: 5, max: 15 },
      keywords: { has: 'السعودية' },
    });
  });

  it('serialises the new fields into the admin URL', () => {
    const filters = parseQuestionBankFilters({
      category: 'cat_history',
      keyword: 'الأندلس',
      time: 'STANDARD',
      type: 'SHORT_ANSWER',
      includeDescendants: '1',
    });
    expect(buildQuestionBankHref(filters)).toContain(
      'keyword=%D8%A7%D9%84%D8%A3%D9%86%D8%AF%D9%84%D8%B3',
    );
    expect(buildQuestionBankHref(filters)).toContain('time=STANDARD');
    expect(buildQuestionBankHref(filters)).toContain('type=SHORT_ANSWER');
    expect(buildQuestionBankHref(filters)).toContain('includeDescendants=1');
  });
});
