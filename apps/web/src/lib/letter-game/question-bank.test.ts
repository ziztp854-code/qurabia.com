import { describe, expect, it } from 'vitest';
import { selectLetterChallengeQuestions } from './question-bank';

describe('letter challenge database question selection', () => {
  it('selects one bank question per letter and falls back only for missing letters', () => {
    const selected = selectLetterChallengeQuestions(
      [
        {
          id: 'bank-alif',
          prompt: 'سؤال الألف من بنك البيانات؟',
          expectedAnswer: 'أبجدية',
          keywords: ['حرف:أ'],
          category: { name: 'أدب ولغة' },
        },
        {
          id: 'bank-baa',
          prompt: 'سؤال الباء من بنك البيانات؟',
          expectedAnswer: 'بحر',
          keywords: ['حرف:ب'],
          category: { name: 'جغرافيا' },
        },
      ],
      () => 0,
    );

    expect(selected).toHaveLength(25);
    expect(selected.find((question) => question.letter === 'أ')?.id).toBe('bank-alif');
    expect(selected.find((question) => question.letter === 'ب')?.id).toBe('bank-baa');
    expect(selected.find((question) => question.letter === 'ت')?.id).toBe('taa-apple');
  });
});
