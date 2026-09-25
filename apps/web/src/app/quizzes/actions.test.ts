import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireActiveUser: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  getPrismaClient: vi.fn(),
  revalidatePath: vi.fn(),
  generateUniqueActivityRoomCode: vi.fn(),
  checkRateLimit: vi.fn(),
  selectOpenClawQuizQuestionIds: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ requireActiveUser: mocks.requireActiveUser }));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: mocks.getPrismaClient,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/quiz/room-code', () => ({
  generateUniqueActivityRoomCode: mocks.generateUniqueActivityRoomCode,
  isRoomCode: vi.fn(() => true),
  normalizeRoomCode: vi.fn((value: string) => value),
}));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock('@/lib/ai/quiz-question-selector', () => ({
  selectOpenClawQuizQuestionIds: mocks.selectOpenClawQuizQuestionIds,
}));

import {
  createQuiz,
  listQuizBuilderQuestions,
  pickOpenClawQuizBuilderQuestions,
  pickRandomQuizBuilderQuestions,
} from './actions';
import { createEmptyQuizDraft } from '@/lib/quizzes/quiz-draft';

describe('listQuizBuilderQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.requireActiveUser.mockResolvedValue({ id: 'user-1', role: 'USER' });
  });

  it('paginates by 40 and enforces published-or-owned access for a regular user', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    mocks.getPrismaClient.mockReturnValue({
      question: { findMany, count },
      category: { findMany: vi.fn().mockResolvedValue([]) },
    });

    await listQuizBuilderQuestions({
      query: 'علوم',
      categoryId: '',
      difficulty: 'MEDIUM',
      gameMode: 'QUIZ',
      page: 2,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40,
        take: 40,
        where: expect.objectContaining({
          gameTypes: { has: 'QUIZ' },
          difficulty: 'MEDIUM',
          OR: [
            { ownerId: 'user-1', status: { in: ['PUBLISHED', 'DRAFT'] } },
            { status: 'PUBLISHED' },
          ],
        }),
      }),
    );
  });
});

describe('pickOpenClawQuizBuilderQuestions', () => {
  const input = {
    preset: 'DIVERSE_20' as const,
    query: '',
    categoryId: '',
    gameMode: 'QUIZ' as const,
    counts: { EASY: 7, MEDIUM: 7, HARD: 6 },
  };
  const candidate = {
    id: 'published-1',
    prompt: 'سؤال منشور',
    difficulty: 'EASY' as const,
    categoryId: 'science',
  };
  const selected = {
    ...candidate,
    status: 'PUBLISHED',
    gameTypes: ['QUIZ'],
    category: { name: 'علوم' },
    timeLimit: 20,
    basePoints: 900,
    version: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.requireActiveUser.mockResolvedValue({ id: 'host-1', role: 'USER' });
    mocks.checkRateLimit.mockResolvedValue(true);
  });

  it('sends published question metadata to the helper and rechecks chosen IDs', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([selected]);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany } });
    mocks.selectOpenClawQuizQuestionIds.mockResolvedValue({
      ids: ['published-1'],
      source: 'openclaw',
    });

    const result = await pickOpenClawQuizBuilderQuestions(input);

    expect(result).toMatchObject({
      status: 'success',
      selectionSource: 'openclaw',
      questions: [{ id: 'published-1', points: 500 }],
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.selectOpenClawQuizQuestionIds).toHaveBeenCalledWith(
      [candidate],
      { EASY: 7, MEDIUM: 7, HARD: 6 },
      expect.any(String),
      undefined,
    );
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED', gameTypes: { has: 'QUIZ' } }),
        select: { id: true, prompt: true, difficulty: true, categoryId: true },
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PUBLISHED', id: { in: ['published-1'] } }),
      }),
    );
  });

  it('uses the balanced local draw when the AI rate limit is unavailable', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([selected]);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany } });
    mocks.checkRateLimit.mockRejectedValue(new Error('Rate limit offline'));

    const result = await pickOpenClawQuizBuilderQuestions(input);

    expect(result).toMatchObject({
      status: 'success',
      selectionSource: 'fallback',
      questions: [{ id: 'published-1' }],
    });
    expect(mocks.selectOpenClawQuizQuestionIds).not.toHaveBeenCalled();
  });

  it('rejects requests without the fixed 20-question preset', async () => {
    const result = await pickOpenClawQuizBuilderQuestions({ ...input, preset: undefined });

    expect(result.status).toBe('error');
    expect(mocks.requireActiveUser).not.toHaveBeenCalled();
    expect(mocks.selectOpenClawQuizQuestionIds).not.toHaveBeenCalled();
  });
});

describe('createQuiz', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.requireActiveUser.mockResolvedValue({ id: 'user-1', role: 'USER' });
    mocks.generateUniqueActivityRoomCode.mockResolvedValue('ROOM12');
  });

  it('draws the 20-question preset across categories and assigns difficulty points', async () => {
    const rows = (['EASY', 'MEDIUM', 'HARD'] as const).map((difficulty, index) => ({
      id: `level-${index}`,
      difficulty,
      categoryId: `cat-${index}`,
      category: { name: `فئة ${index}` },
      prompt: `سؤال ${index}`,
      timeLimit: 20,
      basePoints: 9999,
      version: 1,
      gameTypes: ['QUIZ'],
      status: 'PUBLISHED',
    }));
    const findMany = vi.fn().mockResolvedValue(rows);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany } });
    const result = await pickRandomQuizBuilderQuestions({
      preset: 'DIVERSE_20',
      query: 'بحث',
      categoryId: 'cat-0',
      gameMode: 'QUIZ',
      excludeIds: ['already-added'],
      counts: { EASY: 7, MEDIUM: 7, HARD: 6 },
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(Object.fromEntries(result.questions.map((q) => [q.id, q.points]))).toEqual({
      'level-0': 500,
      'level-1': 700,
      'level-2': 1000,
    });
    const where = findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('categoryId');
    expect(where).not.toHaveProperty('AND');
    expect(where).not.toHaveProperty('id');
    expect(where).toMatchObject({
      status: 'PUBLISHED',
      gameTypes: { has: 'QUIZ' },
      options: { some: {} },
    });
  });

  it('keeps the preset at seven easy, seven medium, and six hard published questions', async () => {
    const rows = (['EASY', 'MEDIUM', 'HARD'] as const).flatMap((difficulty) =>
      ['science', 'history', 'sport', 'language'].flatMap((categoryId) =>
        Array.from({ length: 10 }, (_, index) => ({
          id: `${difficulty}-${categoryId}-${index}`,
          prompt: `${difficulty}-${categoryId}-${index}`,
          difficulty,
          categoryId,
          category: { name: categoryId },
          timeLimit: 20,
          basePoints: 500,
          version: 1,
          gameTypes: ['QUIZ'],
          status: 'PUBLISHED',
        })),
      ),
    );
    const findMany = vi.fn().mockResolvedValue(rows);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany } });

    const result = await pickRandomQuizBuilderQuestions({
      preset: 'DIVERSE_20',
      query: '',
      categoryId: '',
      gameMode: 'QUIZ',
      counts: { EASY: 1, MEDIUM: 0, HARD: 0 },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.questions).toHaveLength(20);
    expect(result.questions.filter((question) => question.difficulty === 'EASY')).toHaveLength(7);
    expect(result.questions.filter((question) => question.difficulty === 'MEDIUM')).toHaveLength(7);
    expect(result.questions.filter((question) => question.difficulty === 'HARD')).toHaveLength(6);
    for (const category of ['science', 'history', 'sport', 'language']) {
      expect(result.questions.filter((question) => question.category === category)).toHaveLength(5);
    }
  });

  it('identifies only rejected selections and does not create a partial quiz', async () => {
    const create = vi.fn();
    const findMany = vi.fn().mockResolvedValue([{ id: 'valid', version: 1 }]);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany }, quiz: { create } });
    const result = await createQuiz({
      ...createEmptyQuizDraft(),
      title: 'مسابقة تجريبية',
      questions: ['valid', 'missing'].map((id) => ({
        id,
        prompt: 'سؤال',
        category: '',
        duration: 20,
        points: 1000,
      })),
    });
    expect(result).toMatchObject({ status: 'error', unavailableQuestionIds: ['missing'] });
    expect(create).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          options: { some: {} },
          gameTypes: { has: 'QUIZ' },
          OR: [
            { ownerId: 'user-1', status: { in: ['PUBLISHED', 'DRAFT'] } },
            { status: 'PUBLISHED' },
          ],
        }),
      }),
    );
  });

  it('rejects repeated question text stored under different IDs before publishing', async () => {
    const create = vi.fn();
    const findMany = vi.fn().mockResolvedValue([
      { id: 'first', prompt: 'ما عاصمة السعودية؟', version: 1 },
      { id: 'duplicate', prompt: 'مَا عَاصِمَةُ السُّعُودِيَّة ؟', version: 1 },
    ]);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany }, quiz: { create } });

    const result = await createQuiz({
      ...createEmptyQuizDraft(),
      title: 'مسابقة بلا تكرار',
      questions: [
        { id: 'first', prompt: 'قديم', category: '', duration: 20, points: 1000 },
        { id: 'duplicate', prompt: 'قديم', category: '', duration: 20, points: 1000 },
      ],
    });

    expect(result).toMatchObject({
      status: 'error',
      unavailableQuestionIds: ['duplicate'],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('excludes selected questions from random candidates and rechecks access when fetching them', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: 'same-text', prompt: 'سُؤال سابق', difficulty: 'EASY', categoryId: null },
        { id: 'fresh', prompt: 'سؤال جديد', difficulty: 'EASY', categoryId: null },
      ])
      .mockResolvedValueOnce([
        { id: 'selected', prompt: 'سؤال سابق', difficulty: 'EASY', categoryId: null },
      ])
      .mockResolvedValueOnce([
        {
          id: 'fresh',
          prompt: 'سؤال جديد',
          status: 'PUBLISHED',
          difficulty: 'EASY',
          gameTypes: ['QUIZ'],
          category: null,
          timeLimit: 20,
          basePoints: 500,
          version: 1,
        },
      ]);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany } });
    const result = await pickRandomQuizBuilderQuestions({
      query: '',
      categoryId: '',
      gameMode: 'QUIZ',
      counts: { EASY: 3, MEDIUM: 0, HARD: 0 },
      excludeIds: ['selected'],
    });
    expect(result).toMatchObject({ status: 'success', questions: [{ id: 'fresh' }] });
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.not.objectContaining({ id: expect.anything() }) }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['selected'] } }),
      }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['fresh'] },
          options: { some: {} },
          gameTypes: { has: 'QUIZ' },
        }),
      }),
    );
  });

  it('publishes an owned public quiz and persists question versions and overrides', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'quiz-1', roomCode: 'ROOM12' });
    mocks.getPrismaClient.mockReturnValue({
      question: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'q1', prompt: 'السؤال الأول', version: 3 },
          { id: 'q2', prompt: 'السؤال الثاني', version: 5 },
        ]),
      },
      quiz: { create },
    });

    const result = await createQuiz({
      version: 5,
      title: 'مسابقة منشورة',
      description: '',
      roundName: 'الجولة الأولى',
      presentationMode: 'SEQUENTIAL',
      playerLimit: 20,
      autoLockAnswers: true,
      autoAdvance: false,
      speedScoring: true,
      visibility: 'PUBLIC',
      gameMode: 'QUIZ',
      questions: [
        {
          id: 'q1',
          prompt: 'السؤال الأول',
          category: 'علوم',
          duration: 30,
          points: 800,
          questionVersion: 3,
        },
        {
          id: 'q2',
          prompt: 'السؤال الثاني',
          category: 'تاريخ',
          duration: 45,
          points: 1200,
          questionVersion: 5,
        },
      ],
    });

    expect(result).toEqual({ status: 'success', quizId: 'quiz-1', roomCode: 'ROOM12' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-1',
        status: 'ACTIVE',
        isPublic: true,
        questions: {
          create: [
            {
              questionId: 'q1',
              position: 0,
              durationOverride: 30,
              pointsOverride: 800,
              questionVersion: 3,
            },
            {
              questionId: 'q2',
              position: 1,
              durationOverride: 45,
              pointsOverride: 1200,
              questionVersion: 5,
            },
          ],
        },
      }),
      select: { id: true, roomCode: true },
    });
  });
});
