import { BOARD_LETTERS, getQuestionForLetter, LETTER_QUESTIONS } from './questions';
import type { LetterQuestion, LetterQuestionCategory } from './types';

export type BankLetterQuestion = {
  id: string;
  prompt: string;
  expectedAnswer: string | null;
  keywords: readonly string[];
  category: { name: string } | null;
};

function readAnswerLetter(keywords: readonly string[]) {
  const marker = keywords.find((keyword) => keyword.startsWith('حرف:'));
  const letter = marker?.slice('حرف:'.length).trim() ?? '';
  return BOARD_LETTERS.includes(letter as (typeof BOARD_LETTERS)[number]) ? letter : null;
}

function mapCategory(name: string | undefined): LetterQuestionCategory {
  if (name?.includes('جغراف')) return 'geography';
  if (name?.includes('علوم')) return 'science';
  return 'objects';
}

export function selectLetterChallengeQuestions(
  rows: readonly BankLetterQuestion[],
  random: () => number = Math.random,
): readonly LetterQuestion[] {
  const candidates = new Map<string, BankLetterQuestion[]>();

  for (const row of rows) {
    if (!row.expectedAnswer) continue;
    const letter = readAnswerLetter(row.keywords);
    if (!letter) continue;
    candidates.set(letter, [...(candidates.get(letter) ?? []), row]);
  }

  return BOARD_LETTERS.map((letter) => {
    const matches = candidates.get(letter) ?? [];
    if (matches.length === 0) return getQuestionForLetter(letter, LETTER_QUESTIONS);
    const index = Math.min(matches.length - 1, Math.floor(Math.max(0, random()) * matches.length));
    const selected = matches[index];
    return {
      id: selected.id,
      letter,
      prompt: selected.prompt,
      answer: selected.expectedAnswer ?? '',
      category: mapCategory(selected.category?.name),
      pattern: 'definition',
    };
  });
}
