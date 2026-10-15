import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  question: { findUnique: vi.fn(), update: vi.fn() },
  questionOption: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  transaction: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: () => true,
  getPrismaClient: () => ({
    user: {
      findUnique: async () => ({ id: 'admin', role: 'ADMIN', status: 'ACTIVE', tokenVersion: 0 }),
    },
    question: mocks.question,
    $transaction: mocks.transaction,
  }),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: async () => ({ user: { id: 'admin', tokenVersion: 0 } }),
  isSessionUserCurrent: () => true,
}));
vi.mock('@/lib/auth/authorization', () => ({ canManageQuestions: () => true }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: async () => true }));
import { PATCH } from './route';
const patch = async (data: object) => {
  const response = await PATCH(
    new Request('http://localhost/api/admin/questions/bank/q1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 1, ...data }),
    }),
    { params: Promise.resolve({ id: 'q1' }) },
  );
  if (!response) throw new Error('Expected an HTTP response');
  return response;
};
describe('question option and point updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.question.findUnique.mockResolvedValue({
      id: 'q1',
      version: 1,
      type: 'MULTIPLE_CHOICE',
      prompt: 'ما عاصمة المملكة العربية السعودية؟',
      difficulty: 'EASY',
      gameTypes: ['QUIZ'],
      basePoints: 1000,
      timeLimit: 20,
      keywords: [],
      options: [
        { id: 'a', text: 'جدة', isCorrect: false },
        { id: 'b', text: 'الرياض', isCorrect: true },
      ],
    });
    mocks.question.update.mockResolvedValue({ id: 'q1', version: 2 });
    mocks.transaction.mockImplementation((fn) =>
      fn({ question: mocks.question, questionOption: mocks.questionOption }),
    );
  });
  it('rejects duplicate answers before writing', async () => {
    expect((await patch({ options: ['الرياض', 'الرياض'], correctOption: 0 })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects an out-of-range correct answer before writing', async () => {
    expect((await patch({ correctOption: 5 })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('preserves the correct index when option texts change', async () => {
    expect((await patch({ options: ['الدمام', 'الرياض'] })).status).toBe(200);
    expect(mocks.questionOption.createMany).toHaveBeenCalledWith({
      data: [
        { questionId: 'q1', position: 0, text: 'الدمام', isCorrect: false },
        { questionId: 'q1', position: 1, text: 'الرياض', isCorrect: true },
      ],
    });
  });
  it('changes correctness alone without replacing option IDs', async () => {
    expect((await patch({ correctOption: 0 })).status).toBe(200);
    expect(mocks.questionOption.deleteMany).not.toHaveBeenCalled();
    expect(mocks.questionOption.update).toHaveBeenCalledWith({
      where: { id: 'a' },
      data: { isCorrect: true },
    });
  });
  it('derives points from authoritative difficulty instead of submitted points', async () => {
    expect((await patch({ difficulty: 'MEDIUM', basePoints: 9999 })).status).toBe(200);
    expect(mocks.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ difficulty: 'MEDIUM', basePoints: 700 }),
      }),
    );
  });
});
