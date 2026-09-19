import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireQuestionManager: vi.fn(),
  hasDatabaseUrl: vi.fn(),
  getPrismaClient: vi.fn(),
  getQuestionImageFile: vi.fn(),
  deleteQuestionImage: vi.fn(),
  uploadQuestionImage: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireQuestionManager: mocks.requireQuestionManager,
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: mocks.hasDatabaseUrl,
  getPrismaClient: mocks.getPrismaClient,
}));

vi.mock('@/lib/questions/media', () => ({
  QuestionImageError: class QuestionImageError extends Error {},
  getQuestionImageFile: mocks.getQuestionImageFile,
  deleteQuestionImage: mocks.deleteQuestionImage,
  uploadQuestionImage: mocks.uploadQuestionImage,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { updateQuestion } from './actions';

function validQuestionForm() {
  const formData = new FormData();
  formData.set('type', 'MULTIPLE_CHOICE');
  formData.set('prompt', 'ما عاصمة المملكة العربية السعودية؟');
  formData.append('options', 'الرياض');
  formData.append('options', 'جدة');
  formData.append('options', 'الدمام');
  formData.append('options', 'مكة المكرمة');
  formData.set('correctOption', '0');
  formData.set('difficulty', 'EASY');
  formData.set('categoryId', '');
  formData.append('gameTypes', 'QUIZ');
  formData.set('timeLimit', '20');
  formData.set('basePoints', '1000');
  return formData;
}

describe('updateQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireQuestionManager.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mocks.hasDatabaseUrl.mockReturnValue(true);
    mocks.getQuestionImageFile.mockReturnValue(null);
    mocks.deleteQuestionImage.mockResolvedValue(undefined);
  });

  it('clears the stored category when no category is selected', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const deleteMany = vi.fn().mockResolvedValue({ count: 4 });
    const createMany = vi.fn().mockResolvedValue({ count: 4 });
    const transactionClient = {
      question: { updateMany },
      questionOption: { deleteMany, createMany },
    };
    mocks.getPrismaClient.mockReturnValue({
      category: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
      question: {
        findFirst: vi.fn().mockResolvedValue({ imageUrl: null }),
      },
      $transaction: vi.fn(async (callback) => callback(transactionClient)),
    });

    const result = await updateQuestion(
      'question-1',
      { status: 'idle', message: '' },
      validQuestionForm(),
    );

    expect(result.status).toBe('success');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ categoryId: null }),
      }),
    );
  });
});
