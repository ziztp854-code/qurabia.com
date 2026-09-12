import { z } from 'zod';

export const QUIZ_BUILDER_GAME_MODES = [
  'QUIZ',
  'LADDER',
  'CATEGORY_BOARD',
  'LETTER_CHALLENGE',
  'MILLIONAIRE',
] as const;

export const quizBuilderGameModeSchema = z.enum(QUIZ_BUILDER_GAME_MODES);
export const quizPresentationModeSchema = z.enum(['SEQUENTIAL', 'RANDOM']);
export const quizVisibilitySchema = z.enum(['PRIVATE', 'PUBLIC']);
export const quizBuilderDifficultySchema = z.enum(['ALL', 'EASY', 'MEDIUM', 'HARD']);

export const quizBuilderQuestionPageSchema = z
  .object({
    query: z.string().trim().max(200, 'عبارة البحث طويلة جدًا.').default(''),
    categoryId: z.string().trim().max(64, 'التصنيف غير صالح.').default(''),
    difficulty: quizBuilderDifficultySchema.default('ALL'),
    gameMode: quizBuilderGameModeSchema,
    page: z.number().int().min(1).max(1_000).default(1),
  })
  .strict();

export const quizBuilderRandomSelectionSchema = z
  .object({
    preset: z.literal('DIVERSE_20').optional(),
    excludeIds: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
    query: z.string().trim().max(200, 'عبارة البحث طويلة جدًا.').default(''),
    categoryId: z.string().trim().max(64, 'التصنيف غير صالح.').default(''),
    gameMode: quizBuilderGameModeSchema,
    counts: z
      .object({
        EASY: z.number().int().min(0).max(100),
        MEDIUM: z.number().int().min(0).max(100),
        HARD: z.number().int().min(0).max(100),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    const total = input.counts.EASY + input.counts.MEDIUM + input.counts.HARD;
    if (total < 1 || total > 100) {
      context.addIssue({
        code: 'custom',
        message: 'يجب أن يكون مجموع السحب العشوائي بين 1 و100 سؤال.',
        path: ['counts'],
      });
    }
  });

export const quizBuilderQuestionSchema = z
  .object({
    id: z.string().trim().min(1, 'معرّف السؤال مطلوب.').max(64, 'معرّف السؤال غير صالح.'),
    prompt: z.string().trim().min(1, 'نص السؤال مطلوب.').max(1_000, 'نص السؤال طويل جدًا.'),
    category: z.string().trim().max(160, 'اسم التصنيف طويل جدًا.'),
    duration: z
      .number()
      .int('وقت السؤال يجب أن يكون عددًا صحيحًا.')
      .min(5, 'وقت السؤال يجب أن يكون بين 5 و300 ثانية.')
      .max(300, 'وقت السؤال يجب أن يكون بين 5 و300 ثانية.'),
    points: z
      .number()
      .int('نقاط السؤال يجب أن تكون عددًا صحيحًا.')
      .min(100, 'نقاط السؤال يجب أن تكون بين 100 و10000 نقطة.')
      .max(10_000, 'نقاط السؤال يجب أن تكون بين 100 و10000 نقطة.'),
    questionVersion: z.number().int().positive('إصدار السؤال غير صالح.').nullable().optional(),
  })
  .strict();

export const quizBuilderDraftSchema = z
  .object({
    version: z.literal(5),
    title: z.string().trim().max(160, 'عنوان المسابقة يجب أن يكون بين 3 و160 حرفًا.'),
    description: z.string().trim().max(1_000, 'وصف المسابقة يجب ألا يتجاوز 1000 حرف.'),
    roundName: z.string().trim().max(160, 'اسم الجولة يجب ألا يتجاوز 160 حرفًا.'),
    presentationMode: quizPresentationModeSchema,
    playerLimit: z
      .number()
      .int('حد اللاعبين يجب أن يكون عددًا صحيحًا.')
      .min(2, 'حد اللاعبين يجب أن يكون بين 2 و500.')
      .max(500, 'حد اللاعبين يجب أن يكون بين 2 و500.'),
    autoLockAnswers: z.boolean(),
    autoAdvance: z.boolean(),
    speedScoring: z.boolean(),
    visibility: quizVisibilitySchema,
    gameMode: quizBuilderGameModeSchema,
    questions: z.array(quizBuilderQuestionSchema).max(100, 'لا يمكن إضافة أكثر من 100 سؤال.'),
  })
  .strict()
  .superRefine((quiz, context) => {
    const seen = new Set<string>();
    quiz.questions.forEach((question, index) => {
      if (seen.has(question.id)) {
        context.addIssue({
          code: 'custom',
          message: 'لا يمكن إضافة السؤال نفسه أكثر من مرة.',
          path: ['questions', index, 'id'],
        });
      }
      seen.add(question.id);
    });
  });

export const quizBuilderSchema = quizBuilderDraftSchema.superRefine((quiz, context) => {
  if (quiz.title.length < 3) {
    context.addIssue({
      code: 'custom',
      message: 'عنوان المسابقة يجب أن يكون بين 3 و160 حرفًا.',
      path: ['title'],
    });
  }
  if (quiz.questions.length === 0) {
    context.addIssue({
      code: 'custom',
      message: 'اختر سؤالًا واحدًا على الأقل.',
      path: ['questions'],
    });
  }
});

export type QuizBuilderGameMode = z.infer<typeof quizBuilderGameModeSchema>;
export type QuizPresentationMode = z.infer<typeof quizPresentationModeSchema>;
export type QuizVisibility = z.infer<typeof quizVisibilitySchema>;
export type QuizBuilderDifficulty = z.infer<typeof quizBuilderDifficultySchema>;
export type QuizBuilderQuestionPageInput = z.infer<typeof quizBuilderQuestionPageSchema>;
export type QuizBuilderRandomSelectionInput = z.infer<typeof quizBuilderRandomSelectionSchema>;
export type QuizBuilderQuestion = z.infer<typeof quizBuilderQuestionSchema>;
export type QuizBuilderDraft = z.infer<typeof quizBuilderDraftSchema>;
export type QuizBuilderInput = z.infer<typeof quizBuilderSchema>;
