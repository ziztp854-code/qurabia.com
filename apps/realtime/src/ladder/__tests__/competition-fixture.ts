import type { PrivateCompetitionBank } from '../ladder-private-bank.js';

export const COMPETITION_FIXTURE: PrivateCompetitionBank = {
  version: 1,
  sets: Array.from({ length: 8 }, (_, setIndex) =>
    Array.from({ length: 10 }, (_, index) => {
      const id = `fixture-${setIndex}-${index}`;
      return {
        id,
        type: 'TRUE_FALSE' as const,
        prompt: `هل العبارة التجريبية رقم ${setIndex}-${index} صحيحة؟`,
        difficulty:
          index < 3
            ? ('EASY' as const)
            : index < 6
              ? ('MEDIUM' as const)
              : ('HARD' as const),
        timeLimit: 30,
        category: { id: `fixture-${index % 2}`, name: 'تجريبي' },
        options: [
          { id: `${id}-a`, text: 'نعم', isCorrect: true },
          { id: `${id}-b`, text: 'لا', isCorrect: false },
        ],
      };
    }),
  ),
  publishedBankIds: Array.from({ length: 9 }, (_, i) => `fixture-0-${i}`),
};
