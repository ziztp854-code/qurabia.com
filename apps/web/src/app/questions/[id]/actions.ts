'use server';

import { revalidatePath } from 'next/cache';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireQuestionManager } from '@/lib/auth/session';
import {
  deleteQuestionImage,
  getQuestionImageFile,
  QuestionImageError,
  uploadQuestionImage,
} from '@/lib/questions/media';
import { resolveCategoryToCanonicalId } from '@/lib/questions/resolve-category';
import { questionSchema } from '@/lib/questions/validation';

export type UpdateQuestionActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

const emptyToUndefined = (value: FormDataEntryValue | null) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

export async function updateQuestion(
  questionId: string,
  _previousState: UpdateQuestionActionState,
  formData: FormData,
): Promise<UpdateQuestionActionState> {
  const user = await requireQuestionManager(`/questions/${questionId}`);
  if (!hasDatabaseUrl()) {
    return { status: 'error', message: 'قاعدة البيانات غير مهيأة بعد.' };
  }

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

  const { options: inputOptions, correctOption, ...question } = parsed.data;
  const client = getPrismaClient();
  const categoryId = await resolveCategoryToCanonicalId(client, question.categoryId);
  const existingQuestion = await client.question.findFirst({
    where: { id: questionId, status: { not: 'ARCHIVED' } },
    select: { imageUrl: true },
  });
  if (!existingQuestion) {
    return {
      status: 'error',
      message: 'تعذّر تعديل السؤال. قد يكون مؤرشفًا أو لا تملك صلاحية الوصول إليه.',
    };
  }

  const imageFile = getQuestionImageFile(formData.get('image'));
  const removeImage = formData.get('removeImage') === 'true';
  let imageUrl = removeImage ? null : existingQuestion.imageUrl;
  let uploadedImageUrl: string | null = null;

  try {
    if (imageFile) {
      uploadedImageUrl = await uploadQuestionImage(imageFile, user.id);
      imageUrl = uploadedImageUrl;
    }
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof QuestionImageError
          ? error.message
          : 'تعذّر رفع الصورة الآن. حاول مرة أخرى.',
    };
  }

  type TxClient = Omit<
    typeof client,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >;
  let updated = false;
  try {
    updated = await client.$transaction(async (prisma: TxClient) => {
      const result = await prisma.question.updateMany({
        where: { id: questionId, status: { not: 'ARCHIVED' } },
        data: { ...question, categoryId: categoryId ?? null, imageUrl },
      });
      if (result.count === 0) return false;

      await prisma.questionOption.deleteMany({ where: { questionId } });
      await prisma.questionOption.createMany({
        data: inputOptions.map((text, position) => ({
          questionId,
          text,
          position,
          isCorrect: position === correctOption,
        })),
      });
      return true;
    });
  } catch {
    if (uploadedImageUrl) {
      await deleteQuestionImage(uploadedImageUrl).catch(() => undefined);
    }
    return { status: 'error', message: 'تعذّر حفظ تعديلات السؤال الآن.' };
  }

  if (!updated) {
    if (uploadedImageUrl) {
      await deleteQuestionImage(uploadedImageUrl).catch(() => undefined);
    }
    return {
      status: 'error',
      message: 'تعذّر تعديل السؤال. قد يكون مؤرشفًا أو لا تملك صلاحية الوصول إليه.',
    };
  }

  if (existingQuestion.imageUrl && existingQuestion.imageUrl !== imageUrl) {
    await deleteQuestionImage(existingQuestion.imageUrl).catch(() => undefined);
  }

  revalidatePath('/questions');
  revalidatePath('/dashboard/questions');
  revalidatePath('/admin/content');
  revalidatePath(`/questions/${questionId}`);
  return { status: 'success', message: 'تم حفظ تعديلات السؤال.' };
}
