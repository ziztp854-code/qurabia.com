import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ liveSession: mocks }),
}));

import { advanceLiveSessionIfDue } from './engine';

describe('HTTP live transition concurrency', () => {
  beforeEach(() => vi.clearAllMocks());

  function setup() {
    const row = {
      status: 'ACTIVE',
      currentQuestionPosition: 0,
      questionStartedAt: new Date(1_000),
      questionRevealedAt: new Date(2_000) as Date | null,
      questionAdvanceAt: new Date(3_000) as Date | null,
      quiz: {
        autoAdvance: true,
        questions: [{ questionId: 'q1' }, { questionId: 'q2' }],
        _count: { questions: 2 },
      },
    };
    mocks.findUnique.mockImplementation(async () => ({ ...row }));
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        where.status !== row.status ||
        where.currentQuestionPosition !== row.currentQuestionPosition ||
        where.questionStartedAt?.getTime() !== row.questionStartedAt.getTime() ||
        where.questionAdvanceAt?.getTime() !== row.questionAdvanceAt?.getTime()
      )
        return { count: 0 };
      row.currentQuestionPosition += data.currentQuestionPosition?.increment ?? 0;
      if (data.questionStartedAt) row.questionStartedAt = data.questionStartedAt;
      row.questionRevealedAt = data.questionRevealedAt;
      row.questionAdvanceAt = data.questionAdvanceAt;
      return { count: 1 };
    });
    return row;
  }

  it('cannot advance an old read after a concurrent finish', async () => {
    const row = setup();
    mocks.findUnique.mockImplementationOnce(async () => {
      const stale = { ...row };
      row.status = 'FINISHED';
      return stale;
    });
    await expect(advanceLiveSessionIfDue('session-1')).resolves.toBe(false);
    expect(row.status).toBe('FINISHED');
    expect(row.currentQuestionPosition).toBe(0);
  });

  it('rejects an old question start even when the position is unchanged', async () => {
    const row = setup();
    mocks.findUnique.mockImplementationOnce(async () => {
      const stale = { ...row };
      row.questionStartedAt = new Date(4_000);
      return stale;
    });
    await expect(advanceLiveSessionIfDue('session-1')).resolves.toBe(false);
    expect(row.currentQuestionPosition).toBe(0);
  });

  it('rejects a superseded deadline and clears the reveal marker on a fresh question', async () => {
    const row = setup();
    mocks.findUnique.mockImplementationOnce(async () => {
      const stale = { ...row };
      row.questionAdvanceAt = new Date(5_000);
      return stale;
    });
    await expect(advanceLiveSessionIfDue('session-1')).resolves.toBe(false);
    await expect(advanceLiveSessionIfDue('session-1')).resolves.toBe(true);
    expect(row.currentQuestionPosition).toBe(1);
    expect(row.questionRevealedAt).toBeNull();
    expect(row.questionAdvanceAt).toBeNull();
  });
});
