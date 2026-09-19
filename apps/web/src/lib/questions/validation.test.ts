import { describe, expect, it } from 'vitest';

import { questionSchema, questionUpdateSchema, validateQuestionRow } from './validation';

describe('questionSchema', () => {
  it('accepts a valid multiple-choice question with keywords', () => {
    const result = questionSchema.safeParse({
      type: 'MULTIPLE_CHOICE',
      prompt: 'ما عاصمة المملكة العربية السعودية؟',
      options: ['الرياض', 'جدة', 'مكة', 'الدمام'],
      correctOption: 0,
      difficulty: 'EASY',
      categoryId: 'cat_1',
      gameTypes: ['QUIZ', 'MILLIONAIRE'],
      timeLimit: 20,
      basePoints: 1000,
      keywords: ['السعودية', 'عواصم', 'جغرافيا'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a multiple-choice question with duplicate options', () => {
    const result = questionSchema.safeParse({
      type: 'MULTIPLE_CHOICE',
      prompt: 'سؤال مكرر؟',
      options: ['نعم', 'نعم', 'لا'],
      correctOption: 0,
      difficulty: 'MEDIUM',
      gameTypes: ['QUIZ'],
      timeLimit: 20,
      basePoints: 1000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('options'))).toBe(true);
    }
  });

  it('rejects a true/false question with the wrong option set', () => {
    const result = questionSchema.safeParse({
      type: 'TRUE_FALSE',
      prompt: 'هل الأرض كروية؟',
      options: ['نعم', 'لا'],
      correctOption: 0,
      difficulty: 'EASY',
      gameTypes: ['QUIZ'],
      timeLimit: 20,
      basePoints: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a SHORT_ANSWER question', () => {
    const result = questionSchema.safeParse({
      type: 'SHORT_ANSWER',
      prompt: 'اذكر اسم أول رئيس للولايات المتحدة.',
      expectedAnswer: 'واشنطن',
      options: [],
      difficulty: 'MEDIUM',
      gameTypes: ['QUESTION_WORD'],
      timeLimit: 30,
      basePoints: 1500,
      keywords: ['تاريخ', 'أمريكا'],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expectedAnswer).toBe('واشنطن');
  });

  it('rejects a SHORT_ANSWER question that carries options', () => {
    const result = questionSchema.safeParse({
      type: 'SHORT_ANSWER',
      prompt: 'سؤال قصير مع خيارات؟',
      expectedAnswer: 'إجابة',
      options: ['إجابة'],
      difficulty: 'MEDIUM',
      gameTypes: ['QUIZ'],
      timeLimit: 20,
      basePoints: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 12 keywords', () => {
    const result = questionSchema.safeParse({
      type: 'MULTIPLE_CHOICE',
      prompt: 'سؤال بكلمات مفتاحية كثيرة جدًا.',
      options: ['نعم', 'لا'],
      correctOption: 0,
      difficulty: 'EASY',
      gameTypes: ['QUIZ'],
      timeLimit: 20,
      basePoints: 1000,
      keywords: Array.from({ length: 15 }, (_, i) => `k${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe('questionUpdateSchema', () => {
  it('accepts a partial update with the version', () => {
    const result = questionUpdateSchema.safeParse({
      prompt: 'تحديث السؤال',
      version: 3,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = questionUpdateSchema.safeParse({
      prompt: 'سؤال',
      version: 1,
      rogue: 'value',
    });
    expect(result.success).toBe(false);
  });

  it('requires the version field for optimistic locking', () => {
    const result = questionUpdateSchema.safeParse({ prompt: 'سؤال' });
    expect(result.success).toBe(false);
  });
});

describe('validateQuestionRow', () => {
  it('flags a multiple-choice row without a correct option', () => {
    const issues = validateQuestionRow({
      type: 'MULTIPLE_CHOICE',
      prompt: 'سؤال بدون إجابة صحيحة',
      options: [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: false },
        { text: 'c', isCorrect: false },
        { text: 'd', isCorrect: false },
      ],
      correctOption: 0,
      expectedAnswer: null,
      timeLimit: 20,
      basePoints: 1000,
      difficulty: 'EASY',
      gameTypes: ['QUIZ'],
      keywords: [],
      categoryId: null,
      status: 'DRAFT',
    });
    expect(issues.some((issue) => issue.path === 'correctOption')).toBe(true);
  });

  it('flags duplicate keywords regardless of case', () => {
    const issues = validateQuestionRow({
      type: 'TRUE_FALSE',
      prompt: 'سؤال صح وخطأ',
      options: [
        { text: 'صح', isCorrect: true },
        { text: 'خطأ', isCorrect: false },
      ],
      correctOption: 0,
      expectedAnswer: null,
      timeLimit: 15,
      basePoints: 1000,
      difficulty: 'EASY',
      gameTypes: ['QUIZ'],
      keywords: ['AI', 'ai'],
      categoryId: null,
      status: 'DRAFT',
    });
    expect(issues.some((issue) => issue.path === 'keywords')).toBe(true);
  });

  it('warns when a published question has other errors', () => {
    const issues = validateQuestionRow({
      type: 'MULTIPLE_CHOICE',
      prompt: 'سؤال منشور بإجابة غائبة',
      options: [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: false },
      ],
      correctOption: 0,
      expectedAnswer: null,
      timeLimit: 20,
      basePoints: 1000,
      difficulty: 'EASY',
      gameTypes: ['QUIZ'],
      keywords: [],
      categoryId: null,
      status: 'PUBLISHED',
    });
    expect(issues.some((issue) => issue.path === 'status')).toBe(true);
  });

  it('returns no errors for a clean SHORT_ANSWER row', () => {
    const issues = validateQuestionRow({
      type: 'SHORT_ANSWER',
      prompt: 'سؤال إجابة قصيرة نظيف',
      options: [],
      correctOption: 0,
      expectedAnswer: 'واشنطن',
      timeLimit: 30,
      basePoints: 1500,
      difficulty: 'MEDIUM',
      gameTypes: ['QUIZ'],
      keywords: ['تاريخ'],
      categoryId: 'cat_1',
      status: 'DRAFT',
    });
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([]);
  });
});
