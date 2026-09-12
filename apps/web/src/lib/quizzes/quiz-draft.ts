import {
  QUIZ_BUILDER_GAME_MODES,
  quizBuilderDraftSchema,
  quizBuilderGameModeSchema,
  type QuizBuilderDraft,
  type QuizBuilderGameMode,
  type QuizBuilderQuestion,
} from '@tahaddi/contracts';

export { QUIZ_BUILDER_GAME_MODES };
export type { QuizBuilderGameMode };

export const QUIZ_BUILDER_GAME_MODE_LABELS: Readonly<Record<QuizBuilderGameMode, string>> = {
  QUIZ: 'المسابقات',
  LADDER: 'السلم',
  CATEGORY_BOARD: 'لوحة الفئات',
  LETTER_CHALLENGE: 'تحدي الحروف',
  MILLIONAIRE: 'من سيربح المليون',
};

export function isQuizBuilderGameMode(value: unknown): value is QuizBuilderGameMode {
  return quizBuilderGameModeSchema.safeParse(value).success;
}

export type QuizDraftQuestion = QuizBuilderQuestion;

export type AvailableBankQuestion = QuizDraftQuestion & {
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  gameTypes?: QuizBuilderGameMode[];
};

export type QuizBuilderCategory = { id: string; name: string };
export type QuizBuilderQuestionPage =
  | {
      status: 'success';
      questions: AvailableBankQuestion[];
      categories: QuizBuilderCategory[];
      page: number;
      pageCount: number;
      total: number;
    }
  | { status: 'error'; message: string };
export type QuizBuilderRandomSelectionResult =
  { status: 'success'; questions: AvailableBankQuestion[] } | { status: 'error'; message: string };

export type QuizDraft = QuizBuilderDraft;

export const QUIZ_DRAFT_STORAGE_KEY = 'tahaddi:quiz-builder:draft:v1';
export const QUIZ_DRAFT_CHANGED_EVENT = 'tahaddi:quiz-draft-changed';

export function createEmptyQuizDraft(): QuizDraft {
  return {
    version: 5,
    title: '',
    description: '',
    roundName: '',
    presentationMode: 'SEQUENTIAL',
    playerLimit: 50,
    autoLockAnswers: true,
    autoAdvance: false,
    speedScoring: true,
    visibility: 'PRIVATE',
    gameMode: 'QUIZ',
    questions: [],
  };
}

export function parseQuizDraft(value: string): QuizDraft | null {
  try {
    const draft = JSON.parse(value) as Record<string, unknown>;
    if (!draft || typeof draft !== 'object' || ![1, 2, 3, 4, 5].includes(Number(draft.version))) {
      return null;
    }
    const parsed = quizBuilderDraftSchema.safeParse({
      ...draft,
      version: 5,
      roundName: draft.roundName ?? '',
      presentationMode: draft.presentationMode ?? 'SEQUENTIAL',
      autoLockAnswers: draft.autoLockAnswers ?? true,
      autoAdvance: draft.autoAdvance ?? false,
      speedScoring: draft.speedScoring ?? true,
      visibility: draft.visibility ?? 'PRIVATE',
      gameMode: isQuizBuilderGameMode(draft.gameMode) ? draft.gameMode : 'QUIZ',
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readQuizDraft(): QuizDraft {
  if (typeof window === 'undefined') return createEmptyQuizDraft();
  return (
    parseQuizDraft(localStorage.getItem(QUIZ_DRAFT_STORAGE_KEY) || '') ?? createEmptyQuizDraft()
  );
}

export function writeQuizDraft(draft: QuizDraft): void {
  localStorage.setItem(QUIZ_DRAFT_STORAGE_KEY, JSON.stringify(quizBuilderDraftSchema.parse(draft)));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(QUIZ_DRAFT_CHANGED_EVENT));
  }
}

export type AddQuestionToDraftResult =
  | { status: 'added'; count: number }
  | { status: 'exists'; count: number }
  | { status: 'error'; message: string };

/** Adds a bank question into the local quiz-builder draft used by /quizzes/new. */
export function addQuestionToQuizDraft({
  gameTypes,
  ...question
}: QuizDraftQuestion & { gameTypes?: string[] }): AddQuestionToDraftResult {
  try {
    const draft = readQuizDraft();
    if (gameTypes && !gameTypes.includes(draft.gameMode)) {
      return {
        status: 'error',
        message:
          'السؤال غير متوافق مع وضع المسابقة الحالي. غيّر الوضع في منشئ المسابقة أو اختر سؤالًا آخر.',
      };
    }
    if (draft.questions.some((existing) => existing.id === question.id)) {
      return { status: 'exists', count: draft.questions.length };
    }
    const next = quizBuilderDraftSchema.safeParse({
      ...draft,
      questions: [...draft.questions, question],
    });
    if (!next.success) {
      return {
        status: 'error',
        message: next.error.issues[0]?.message ?? 'بيانات السؤال غير صالحة.',
      };
    }
    writeQuizDraft(next.data);
    return { status: 'added', count: next.data.questions.length };
  } catch {
    return { status: 'error', message: 'تعذّر حفظ السؤال في مسودة المسابقة.' };
  }
}

export function isQuestionInQuizDraft(questionId: string): boolean {
  try {
    return readQuizDraft().questions.some((question) => question.id === questionId);
  } catch {
    return false;
  }
}

export function questionSupportsGameMode(
  question: Pick<AvailableBankQuestion, 'gameTypes'>,
  gameMode: QuizBuilderGameMode,
): boolean {
  const types = question.gameTypes;
  if (!types || types.length === 0) return gameMode === 'QUIZ';
  return types.includes(gameMode);
}
