import { loadBankTaggedQuestions } from './load-bank-pool';
import { loadQuizPackQuestions } from './load-quiz-pack';
import type { QuestionFeedGameMode, QuestionFeedResult } from './types';
import { QuestionFeedError } from './types';

export type ResolveFeedInput = {
  gameMode: QuestionFeedGameMode;
  quizId?: string | null;
  ownerId?: string;
  allowDraftQuestions?: boolean;
  bankTake?: number;
  bankTypes?: Array<'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER'>;
};

/**
 * Prefer a curated quiz pack when quizId is provided; otherwise use bank tags.
 * Pack failures (wrong mode / empty) fall through to the bank unless `requirePack` is set.
 */
export async function resolveQuestionFeed(
  input: ResolveFeedInput & { requirePack?: boolean },
): Promise<QuestionFeedResult> {
  const quizId = input.quizId?.trim() || null;

  if (quizId) {
    try {
      return await loadQuizPackQuestions(quizId, input.gameMode, {
        ownerId: input.ownerId,
        allowDraftQuestions: input.allowDraftQuestions,
      });
    } catch (error) {
      if (input.requirePack || !(error instanceof QuestionFeedError)) throw error;
    }
  }

  const bank = await loadBankTaggedQuestions(input.gameMode, {
    take: input.bankTake,
    types: input.bankTypes,
  });

  if (bank.rows.length === 0 && input.requirePack) {
    throw new QuestionFeedError('لا توجد أسئلة متاحة لهذا الوضع.', 'EMPTY');
  }

  return bank;
}
