import { describe, expect, it } from 'vitest';
import { quizBuilderRandomSelectionSchema, quizBuilderSchema } from '@tahaddi/contracts';

const validQuiz = {
  version: 5,
  title: 'مسابقة الجغرافيا',
  description: 'اختبار قصير',
  roundName: 'الجولة الأولى',
  presentationMode: 'SEQUENTIAL',
  playerLimit: 50,
  autoLockAnswers: true,
  autoAdvance: false,
  speedScoring: true,
  visibility: 'PRIVATE',
  gameMode: 'QUIZ',
  questions: [
    {
      id: 'question-1',
      prompt: 'ما عاصمة السعودية؟',
      category: 'جغرافيا',
      duration: 20,
      points: 1_000,
      questionVersion: 2,
    },
  ],
};

describe('quizBuilderSchema', () => {
  it('accepts a valid quiz builder payload', () => {
    expect(quizBuilderSchema.safeParse(validQuiz).success).toBe(true);
  });

  it('accepts both supported publication visibility values', () => {
    expect(quizBuilderSchema.safeParse({ ...validQuiz, visibility: 'PRIVATE' }).success).toBe(true);
    expect(quizBuilderSchema.safeParse({ ...validQuiz, visibility: 'PUBLIC' }).success).toBe(true);
  });

  it.each([
    [{ ...validQuiz, title: 'أ' }, 'عنوان المسابقة يجب أن يكون بين 3 و160 حرفًا.'],
    [
      { ...validQuiz, questions: [...validQuiz.questions, validQuiz.questions[0]] },
      'لا يمكن إضافة السؤال نفسه أكثر من مرة.',
    ],
    [
      {
        ...validQuiz,
        questions: [{ ...validQuiz.questions[0], duration: 4, points: 99 }],
      },
      'وقت السؤال يجب أن يكون بين 5 و300 ثانية.',
    ],
  ])('rejects invalid input with an Arabic reason', (input, message) => {
    const result = quizBuilderSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(message);
    }
  });
});

describe('quizBuilderRandomSelectionSchema', () => {
  it('accepts a bounded difficulty distribution and rejects more than 100 questions', () => {
    const base = {
      query: '',
      categoryId: '',
      gameMode: 'QUIZ',
      counts: { EASY: 2, MEDIUM: 3, HARD: 4 },
    };
    expect(quizBuilderRandomSelectionSchema.safeParse(base).success).toBe(true);
    expect(
      quizBuilderRandomSelectionSchema.safeParse({
        ...base,
        counts: { EASY: 40, MEDIUM: 40, HARD: 40 },
      }).success,
    ).toBe(false);
  });
});
