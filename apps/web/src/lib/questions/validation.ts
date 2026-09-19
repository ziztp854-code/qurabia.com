import { z } from 'zod';
import { MAX_KEYWORDS_PER_QUESTION, MAX_KEYWORD_LENGTH } from './keywords';

const optionSchema = z.string().trim().min(1, 'اكتب نص الخيار.').max(500, 'الخيار طويل جدًا.');

const baseMetadata = {
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  categoryId: z.string().trim().max(191, 'معرّف التصنيف غير صالح.').optional().nullable(),
  gameTypes: z
    .array(
      z.enum([
        'QUIZ',
        'CATEGORY_BOARD',
        'LETTER_CHALLENGE',
        'MILLIONAIRE',
        'LADDER',
        'QUESTION_WORD',
      ]),
    )
    .min(1, 'اختر لعبة واحدة على الأقل.'),
  explanation: z.string().trim().max(2000, 'الشرح طويل جدًا.').optional().nullable(),
  source: z.string().trim().max(500, 'المصدر طويل جدًا.').optional().nullable(),
  timeLimit: z.coerce
    .number()
    .int()
    .min(5, 'الوقت الأدنى 5 ثوانٍ.')
    .max(300, 'الوقت الأقصى 300 ثانية.'),
  basePoints: z.coerce
    .number()
    .int()
    .min(100, 'النقاط الأدنى 100.')
    .max(10000, 'النقاط القصوى 10000.'),
  keywords: z
    .array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH))
    .max(MAX_KEYWORDS_PER_QUESTION, 'الحد الأقصى 12 كلمة مفتاحية للسؤال.')
    .optional()
    .default([]),
  expectedAnswer: z.string().trim().max(200, 'الإجابة المتوقعة طويلة جدًا.').optional().nullable(),
};

const multipleChoice = z
  .object({
    type: z.literal('MULTIPLE_CHOICE'),
    prompt: z.string().trim().min(8, 'اكتب سؤالًا أوضح.').max(1000, 'السؤال طويل جدًا.'),
    options: z
      .array(optionSchema)
      .min(2, 'أضف خيارين على الأقل.')
      .max(6, 'الحد الأقصى ستة خيارات.'),
    correctOption: z.coerce.number().int().nonnegative(),
    ...baseMetadata,
  })
  .superRefine((value, context) => {
    if (value.correctOption >= value.options.length) {
      context.addIssue({
        code: 'custom',
        path: ['correctOption'],
        message: 'اختر إجابة صحيحة من الخيارات المكتوبة.',
      });
    }
    if (new Set(value.options).size !== value.options.length) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'خيارات السؤال يجب أن تكون متمايزة.',
      });
    }
    const correctCount = value.options.filter(
      (option) => option === value.options[value.correctOption],
    ).length;
    if (correctCount !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['correctOption'],
        message: 'يجب أن يطابق مؤشر الإجابة الصحيحة خيارًا واحدًا فقط.',
      });
    }
  });

const trueFalse = z
  .object({
    type: z.literal('TRUE_FALSE'),
    prompt: z.string().trim().min(8, 'اكتب سؤالًا أوضح.').max(1000, 'السؤال طويل جدًا.'),
    options: z.array(optionSchema).length(2, 'سؤال صح أو خطأ يحتوي خيارين فقط.'),
    correctOption: z.coerce.number().int().min(0).max(1),
    ...baseMetadata,
  })
  .superRefine((value, context) => {
    if (value.options[0] !== 'صح' && value.options[0] !== 'خطأ') {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'سؤال صح أو خطأ يجب أن يستخدم قيمي "صح" و"خطأ".',
      });
    }
  });

const shortAnswer = z
  .object({
    type: z.literal('SHORT_ANSWER'),
    prompt: z.string().trim().min(8, 'اكتب سؤالًا أوضح.').max(1000, 'السؤال طويل جدًا.'),
    expectedAnswer: z
      .string()
      .trim()
      .min(1, 'اكتب الإجابة المتوقعة.')
      .max(200, 'الإجابة المتوقعة طويلة جدًا.'),
    options: z
      .array(optionSchema)
      .max(0, 'سؤال الإجابة القصيرة لا يحتاج خيارات.')
      .optional()
      .default([]),
    correctOption: z.coerce.number().int().min(0).max(0).optional().default(0),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
    categoryId: z.string().trim().max(191, 'معرّف التصنيف غير صالح.').optional().nullable(),
    gameTypes: z
      .array(
        z.enum([
          'QUIZ',
          'CATEGORY_BOARD',
          'LETTER_CHALLENGE',
          'MILLIONAIRE',
          'LADDER',
          'QUESTION_WORD',
        ]),
      )
      .min(1, 'اختر لعبة واحدة على الأقل.'),
    explanation: z.string().trim().max(2000, 'الشرح طويل جدًا.').optional().nullable(),
    source: z.string().trim().max(500, 'المصدر طويل جدًا.').optional().nullable(),
    timeLimit: z.coerce
      .number()
      .int()
      .min(5, 'الوقت الأدنى 5 ثوانٍ.')
      .max(300, 'الوقت الأقصى 300 ثانية.'),
    basePoints: z.coerce
      .number()
      .int()
      .min(100, 'النقاط الأدنى 100.')
      .max(10000, 'النقاط القصوى 10000.'),
    keywords: z
      .array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH))
      .max(MAX_KEYWORDS_PER_QUESTION, 'الحد الأقصى 12 كلمة مفتاحية للسؤال.')
      .optional()
      .default([]),
  })
  .superRefine((value, context) => {
    if (value.options && value.options.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'سؤال الإجابة القصيرة لا يقبل خيارات.',
      });
    }
  });

export const questionSchema = z.discriminatedUnion('type', [
  multipleChoice,
  trueFalse,
  shortAnswer,
]);

export type QuestionInput = z.infer<typeof questionSchema>;
export type QuestionTypeInput = QuestionInput['type'];

/**
 * Schema for partial updates from the editor. The editor keeps the
 * `type` fixed and only edits the rest of the fields, so we strip
 * type-specific fields that the route does not need to validate.
 */
export const questionUpdateSchema = z
  .object({
    prompt: z.string().trim().min(8, 'اكتب سؤالًا أوضح.').max(1000, 'السؤال طويل جدًا.').optional(),
    options: z.array(optionSchema).min(0).max(6).optional(),
    correctOption: z.coerce.number().int().nonnegative().optional(),
    expectedAnswer: z.string().trim().max(200).optional().nullable(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    categoryId: z.string().trim().max(191).optional().nullable(),
    gameTypes: z
      .array(
        z.enum([
          'QUIZ',
          'CATEGORY_BOARD',
          'LETTER_CHALLENGE',
          'MILLIONAIRE',
          'LADDER',
          'QUESTION_WORD',
        ]),
      )
      .min(1)
      .optional(),
    explanation: z.string().trim().max(2000).optional().nullable(),
    source: z.string().trim().max(500).optional().nullable(),
    timeLimit: z.coerce.number().int().min(5).max(300).optional(),
    basePoints: z.coerce.number().int().min(100).max(10000).optional(),
    keywords: z
      .array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH))
      .max(MAX_KEYWORDS_PER_QUESTION)
      .optional(),
    version: z.coerce.number().int().nonnegative(),
  })
  .strict();

export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

/**
 * Returns the structured issues for an existing question row, so the
 * admin preview panel can highlight what would be rejected if the
 * admin saved today.
 */
export type QuestionRowForValidation = {
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  prompt: string;
  options: ReadonlyArray<{ text: string; isCorrect: boolean }>;
  correctOption: number;
  expectedAnswer: string | null;
  timeLimit: number;
  basePoints: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  gameTypes: ReadonlyArray<
    'QUIZ' | 'CATEGORY_BOARD' | 'LETTER_CHALLENGE' | 'MILLIONAIRE' | 'LADDER' | 'QUESTION_WORD'
  >;
  keywords: ReadonlyArray<string>;
  categoryId: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};

export type QuestionIssue = {
  level: 'error' | 'warning';
  path: string;
  message: string;
};

const MAX_PROMPT_LENGTH = 1000;
const MAX_KEYWORDS = MAX_KEYWORDS_PER_QUESTION;
const MIN_OPTIONS_BY_TYPE: Record<QuestionRowForValidation['type'], number> = {
  MULTIPLE_CHOICE: 2,
  TRUE_FALSE: 2,
  SHORT_ANSWER: 0,
};

export function validateQuestionRow(row: QuestionRowForValidation): QuestionIssue[] {
  const issues: QuestionIssue[] = [];

  if (row.prompt.trim().length < 8) {
    issues.push({
      level: 'error',
      path: 'prompt',
      message: 'نص السؤال قصير جدًا.',
    });
  }
  if (row.prompt.length > MAX_PROMPT_LENGTH) {
    issues.push({
      level: 'error',
      path: 'prompt',
      message: 'نص السؤال يتجاوز الحد المسموح.',
    });
  }
  if (row.gameTypes.length === 0) {
    issues.push({
      level: 'error',
      path: 'gameTypes',
      message: 'اختر لعبة واحدة على الأقل.',
    });
  }
  if (row.keywords.length > MAX_KEYWORDS) {
    issues.push({
      level: 'error',
      path: 'keywords',
      message: 'الحد الأقصى 12 كلمة مفتاحية.',
    });
  }
  const uniqueKeywords = new Set(row.keywords.map((k) => k.trim().toLowerCase()));
  if (uniqueKeywords.size !== row.keywords.length) {
    issues.push({
      level: 'error',
      path: 'keywords',
      message: 'الكلمات المفتاحية يجب أن تكون متمايزة.',
    });
  }
  if (row.timeLimit < 5 || row.timeLimit > 300) {
    issues.push({
      level: 'error',
      path: 'timeLimit',
      message: 'الوقت يجب أن يكون بين 5 و300 ثانية.',
    });
  }
  if (row.basePoints < 100 || row.basePoints > 10000) {
    issues.push({
      level: 'error',
      path: 'basePoints',
      message: 'النقاط يجب أن تكون بين 100 و10000.',
    });
  }
  if (row.options.length < MIN_OPTIONS_BY_TYPE[row.type]) {
    issues.push({
      level: 'error',
      path: 'options',
      message: 'عدد الخيارات لا يطابق نوع السؤال.',
    });
  }
  if (row.type === 'TRUE_FALSE' && row.options.length !== 2) {
    issues.push({
      level: 'error',
      path: 'options',
      message: 'سؤال صح أو خطأ يحتاج خيارين فقط.',
    });
  }
  if (
    row.type === 'SHORT_ANSWER' &&
    (!row.expectedAnswer || row.expectedAnswer.trim().length === 0)
  ) {
    issues.push({
      level: 'error',
      path: 'expectedAnswer',
      message: 'سؤال الإجابة القصيرة يحتاج إجابة متوقعة.',
    });
  }
  if (row.type !== 'SHORT_ANSWER') {
    const correctIndex = row.options.findIndex((option) => option.isCorrect);
    if (correctIndex === -1) {
      issues.push({
        level: 'error',
        path: 'correctOption',
        message: 'لا يوجد خيار صحيح.',
      });
    } else if (row.correctOption !== correctIndex) {
      issues.push({
        level: 'warning',
        path: 'correctOption',
        message: 'مؤشر الإجابة الصحيحة لا يطابق الخيار الصحيح في البيانات.',
      });
    }
  }
  if (row.status === 'PUBLISHED' && issues.some((issue) => issue.level === 'error')) {
    issues.push({
      level: 'warning',
      path: 'status',
      message: 'السؤال منشور لكنه يحتوي أخطاء. راجع قبل المتابعة.',
    });
  }
  return issues;
}
