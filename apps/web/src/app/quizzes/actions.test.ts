import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireActiveUser: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  getPrismaClient: vi.fn(),
  revalidatePath: vi.fn(),
  generateUniqueActivityRoomCode: vi.fn(),
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

import { createQuiz, listQuizBuilderQuestions, pickRandomQuizBuilderQuestions } from './actions';
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
      prompt: 'سؤال',
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
    expect(where).toMatchObject({
      id: { notIn: ['already-added'] },
      gameTypes: { has: 'QUIZ' },
      options: { some: {} },
    });
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

  it('excludes selected questions from random candidates and rechecks access when fetching them', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    mocks.getPrismaClient.mockReturnValue({ question: { findMany } });
    await pickRandomQuizBuilderQuestions({
      query: '',
      categoryId: '',
      gameMode: 'QUIZ',
      counts: { EASY: 1, MEDIUM: 0, HARD: 0 },
      excludeIds: ['selected'],
    });
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ id: { notIn: ['selected'] } }) }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ options: { some: {} }, gameTypes: { has: 'QUIZ' } }),
      }),
    );
  });

  it('publishes an owned public quiz and persists question versions and overrides', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'quiz-1', roomCode: 'ROOM12' });
    mocks.getPrismaClient.mockReturnValue({
      question: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'q1', version: 3 },
          { id: 'q2', version: 5 },
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
