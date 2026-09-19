import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  getPrismaClient: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requirePermission: mocks.requirePermission,
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: mocks.getPrismaClient,
}));

import { fetchBankQuestions } from './fetch-questions';

const FETCH_QUESTIONS_COUNT = 20;

function prismaStub(rows: Array<Record<string, unknown>>) {
  return {
    category: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    question: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce(rows.map((row) => ({ id: row.id })))
        .mockResolvedValueOnce(rows),
    },
  };
}

const actor = { id: 'admin-1', role: 'ADMIN' };

describe('fetchBankQuestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue(actor);
    mocks.hasDatabaseUrl.mockReturnValue(true);
  });

  it('pulls a random sample capped at 20 published questions', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: `q-${index}`,
      prompt: `سؤال ${index}`,
      timeLimit: 20,
      basePoints: 1000,
      version: 1,
      category: { name: 'علوم' },
    }));
    const prisma = prismaStub(rows);
    mocks.getPrismaClient.mockReturnValue(prisma);

    const result = await fetchBankQuestions({
      category: 'ALL',
      q: '',
      difficulty: 'ALL',
      game: 'ALL',
      time: 'ANY',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.questions).toHaveLength(FETCH_QUESTIONS_COUNT);
    expect(new Set(result.questions.map((q) => q.id)).size).toBe(FETCH_QUESTIONS_COUNT);
    expect(result.questions.every((q) => q.category === 'علوم')).toBe(true);
  });

  it('forces PUBLISHED status regardless of the input filters', async () => {
    const prisma = prismaStub([
      { id: 'q-1', prompt: 'سؤال', timeLimit: 20, basePoints: 1000, version: 1, category: null },
    ]);
    mocks.getPrismaClient.mockReturnValue(prisma);

    await fetchBankQuestions({
      category: 'ALL',
      q: '',
      difficulty: 'ALL',
      game: 'ALL',
      time: 'ANY',
    });

    const whereArg = prisma.question.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe('PUBLISHED');
  });

  it('reports an empty pool before querying a sample', async () => {
    const prisma = prismaStub([]);
    mocks.getPrismaClient.mockReturnValue(prisma);

    const result = await fetchBankQuestions({
      category: 'ALL',
      q: '',
      difficulty: 'ALL',
      game: 'ALL',
      time: 'ANY',
    });

    expect(result).toEqual({ status: 'error', message: 'لا توجد أسئلة منشورة مطابقة للفلاتر الحالية.' });
    expect(prisma.question.findMany).toHaveBeenCalledTimes(1);
  });

  it('maps rows into clean quiz-draft questions', async () => {
    const prisma = prismaStub([
      { id: 'q-9', prompt: 'سؤال تجريبي', timeLimit: 15, basePoints: 500, version: 3, category: { name: 'تاريخ' } },
    ]);
    mocks.getPrismaClient.mockReturnValue(prisma);

    const result = await fetchBankQuestions({
      category: 'ALL',
      q: '',
      difficulty: 'ALL',
      game: 'ALL',
      time: 'ANY',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.questions).toEqual([
      {
        id: 'q-9',
        prompt: 'سؤال تجريبي',
        category: 'تاريخ',
        duration: 15,
        points: 500,
        questionVersion: 3,
      },
    ]);
  });

  it('fails closed without a database', async () => {
    mocks.hasDatabaseUrl.mockReturnValue(false);
    const result = await fetchBankQuestions({
      category: 'ALL',
      q: '',
      difficulty: 'ALL',
      game: 'ALL',
      time: 'ANY',
    });
    expect(result).toEqual({ status: 'error', message: 'قاعدة البيانات غير مهيأة.' });
  });
});
