import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { QuestionFeedRow } from './types';
import { QuestionFeedError, playHrefForPack } from './types';
import { adaptFeedToLetterQuestions } from './adapters/to-letter';
import { adaptFeedToLadderCandidates } from './adapters/to-ladder';
import { adaptFeedToMillionaireQuestions } from './adapters/to-millionaire';
import { adaptFeedToCategoryBoardLibrary } from './adapters/to-category-board';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  hasDatabaseUrl: vi.fn(() => true),
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: () => mocks.hasDatabaseUrl(),
  getPrismaClient: () => ({
    quiz: { findFirst: mocks.findFirst },
  }),
}));

function baseRow(overrides: Partial<QuestionFeedRow> = {}): QuestionFeedRow {
  return {
    id: 'q1',
    prompt: 'سؤال؟',
    type: 'MULTIPLE_CHOICE',
    expectedAnswer: null,
    difficulty: 'EASY',
    categoryId: 'cat-1',
    categoryName: 'علوم',
    timeLimit: 30,
    basePoints: 100,
    keywords: [],
    explanation: null,
    options: [
      { id: 'a', text: 'أ', isCorrect: true, position: 0 },
      { id: 'b', text: 'ب', isCorrect: false, position: 1 },
      { id: 'c', text: 'ج', isCorrect: false, position: 2 },
      { id: 'd', text: 'د', isCorrect: false, position: 3 },
    ],
    position: 0,
    ...overrides,
  };
}

describe('question feed', () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.hasDatabaseUrl.mockReturnValue(true);
  });

  it('rejects quiz packs whose gameMode does not match', async () => {
    const { loadQuizPackQuestions } = await import('./load-quiz-pack');
    mocks.findFirst.mockResolvedValue({
      id: 'quiz-1',
      title: 'حزمة سلم',
      gameMode: 'LADDER',
      status: 'DRAFT',
      questions: [],
    });

    await expect(loadQuizPackQuestions('quiz-1', 'LETTER_CHALLENGE')).rejects.toMatchObject({
      code: 'MODE_MISMATCH',
    } satisfies Partial<QuestionFeedError>);
  });

  it('applies stored duration and point overrides from the quiz snapshot', async () => {
    const { loadQuizPackQuestions } = await import('./load-quiz-pack');
    mocks.findFirst.mockResolvedValue({
      id: 'quiz-1',
      title: 'حزمة سلم',
      gameMode: 'LADDER',
      status: 'ACTIVE',
      questions: [
        {
          position: 0,
          durationOverride: 45,
          pointsOverride: 1600,
          question: {
            id: 'q1',
            prompt: 'سؤال؟',
            type: 'MULTIPLE_CHOICE',
            expectedAnswer: null,
            difficulty: 'EASY',
            timeLimit: 20,
            basePoints: 1000,
            keywords: [],
            explanation: null,
            status: 'PUBLISHED',
            gameTypes: ['LADDER'],
            category: { id: 'cat-1', name: 'علوم' },
            options: [],
          },
        },
      ],
    });

    const result = await loadQuizPackQuestions('quiz-1', 'LADDER');
    expect(result.rows[0]).toMatchObject({ timeLimit: 45, basePoints: 1600 });
  });

  it('preserves letter keyword when adapting letter questions', () => {
    const adapted = adaptFeedToLetterQuestions(
      [
        baseRow({
          id: 'letter-alif',
          type: 'SHORT_ANSWER',
          expectedAnswer: 'أبجدية',
          keywords: ['حرف:أ'],
          categoryName: 'أدب',
          options: [],
        }),
      ],
      () => 0,
    );

    expect(adapted.find((question) => question.letter === 'أ')).toMatchObject({
      id: 'letter-alif',
      answer: 'أبجدية',
      letter: 'أ',
    });
  });

  it('maps multiple-choice rows into ladder candidates', () => {
    const candidates = adaptFeedToLadderCandidates([baseRow({ id: 'ladder-1' })]);
    expect(candidates).toEqual([
      expect.objectContaining({
        id: 'ladder-1',
        type: 'MULTIPLE_CHOICE',
        difficulty: 'EASY',
        category: { id: 'cat-1', name: 'علوم' },
      }),
    ]);
  });

  it('maps millionaire levels from keywords and category-board values from قيمة', () => {
    const millionaire = adaptFeedToMillionaireQuestions([
      baseRow({ id: 'm1', keywords: ['مستوى:3'], basePoints: 50 }),
    ]);
    expect(millionaire[0]).toMatchObject({ id: 'm1', level: 3, value: 300 });

    const library = adaptFeedToCategoryBoardLibrary([
      baseRow({
        id: 'c1',
        type: 'SHORT_ANSWER',
        expectedAnswer: 'المريخ',
        keywords: ['قيمة:200'],
        categoryName: 'فضاء',
        options: [],
      }),
      baseRow({
        id: 'c2',
        type: 'SHORT_ANSWER',
        expectedAnswer: 'المشتري',
        keywords: ['قيمة:400'],
        categoryName: 'فضاء',
        options: [],
      }),
      baseRow({
        id: 'c3',
        type: 'SHORT_ANSWER',
        expectedAnswer: 'زحل',
        keywords: ['قيمة:600'],
        categoryName: 'فضاء',
        options: [],
      }),
    ]);
    expect(library[0]?.questions.map((question) => question.value)).toEqual([200, 400, 600]);
  });

  it('builds play hrefs with quizId for special modes only', () => {
    expect(playHrefForPack('QUIZ', 'abc')).toBe('/host');
    expect(playHrefForPack('LETTER_CHALLENGE', 'abc')).toBe('/games/letter-challenge?quizId=abc');
    expect(playHrefForPack('LADDER')).toBe('/games/ladder/host');
  });
});
