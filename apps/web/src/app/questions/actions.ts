'use server';

import { revalidatePath } from 'next/cache';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireQuestionManager } from '@/lib/auth/session';
import { consumeQuota, refundQuota } from '@/lib/subscription/entitlements';
import {
  deleteQuestionImage,
  getQuestionImageFile,
  QuestionImageError,
  uploadQuestionImage,
} from '@/lib/questions/media';
import { resolveCategoryToCanonicalId } from '@/lib/questions/resolve-category';
import { questionSchema } from '@/lib/questions/validation';

export type QuestionActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

const emptyToUndefined = (value: FormDataEntryValue | null) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

export async function createQuestion(
  _previousState: QuestionActionState,
  formData: FormData,
): Promise<QuestionActionState> {
  const user = await requireQuestionManager('/questions');
  const type = formData.get('type');
  const rawOptions = formData
    .getAll('options')
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const options = type === 'TRUE_FALSE' ? ['صح', 'خطأ'] : rawOptions;
  const parsed = questionSchema.safeParse({
    type,
    prompt: formData.get('prompt'),
    options,
    correctOption: formData.get('correctOption'),
    difficulty: formData.get('difficulty'),
    categoryId: emptyToUndefined(formData.get('categoryId')),
    gameTypes: formData.getAll('gameTypes'),
    expectedAnswer: emptyToUndefined(formData.get('expectedAnswer')),
    explanation: emptyToUndefined(formData.get('explanation')),
    source: emptyToUndefined(formData.get('source')),
    timeLimit: formData.get('timeLimit'),
    basePoints: formData.get('basePoints'),
  });

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message || 'راجع بيانات السؤال.' };
  }
  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'قاعدة البيانات غير مهيأة بعد.' };
  }

  const { options: inputOptions, correctOption, ...question } = parsed.data;
  const prisma = getPrismaClient();
  const quota = await consumeQuota(user.id, 'maxQuestionsPerMonth', user.role);
  if (!quota.ok) {
    return { status: 'error', message: quota.message };
  }
  const categoryId = await resolveCategoryToCanonicalId(prisma, question.categoryId);
  const imageFile = getQuestionImageFile(formData.get('image'));
  let imageUrl: string | null = null;

  try {
    imageUrl = imageFile ? await uploadQuestionImage(imageFile, user.id) : null;
    await prisma.question.create({
      data: {
        ...question,
        categoryId,
        imageUrl,
        ownerId: user.id,
        options: {
          create: inputOptions.map((text, position) => ({
            text,
            position,
            isCorrect: position === correctOption,
          })),
        },
      },
    });
  } catch (error) {
    await refundQuota(user.id, 'maxQuestionsPerMonth').catch(() => undefined);
    if (imageUrl) {
      await deleteQuestionImage(imageUrl).catch(() => undefined);
    }
    return {
      status: 'error',
      message:
        error instanceof QuestionImageError
          ? error.message
          : 'تعذّر حفظ السؤال الآن. حاول مرة أخرى.',
    };
  }

  revalidatePath('/questions');
  revalidatePath('/dashboard/questions');
  revalidatePath('/admin/content');
  return { status: 'success', message: 'حُفظ السؤال كمسودة.' };
}

export async function archiveQuestion(formData: FormData) {
  await requireQuestionManager('/questions');
  const id = formData.get('id');
  if (typeof id !== 'string' || !id) return;

  await getPrismaClient().question.updateMany({
    where: { id, status: { not: 'ARCHIVED' } },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
  revalidatePath('/questions');
  revalidatePath('/dashboard/questions');
}
