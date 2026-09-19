import { BOARD_LETTERS, getQuestionForLetter, LETTER_QUESTIONS } from '@/lib/letter-game/questions';
import type { LetterQuestion, LetterQuestionCategory } from '@/lib/letter-game/types';
import type { QuestionFeedRow } from '../types';

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

export function adaptFeedToLetterQuestions(
  rows: readonly QuestionFeedRow[],
  random: () => number = Math.random,
): LetterQuestion[] {
  const candidates = new Map<string, QuestionFeedRow[]>();

  for (const row of rows) {
    const answer = row.expectedAnswer?.trim();
    if (!answer) continue;
    const letter = readAnswerLetter(row.keywords);
    if (!letter) continue;
    candidates.set(letter, [...(candidates.get(letter) ?? []), row]);
  }

  return BOARD_LETTERS.map((letter) => {
    const matches = candidates.get(letter) ?? [];
    if (matches.length === 0) return getQuestionForLetter(letter, LETTER_QUESTIONS);
    const index = Math.min(matches.length - 1, Math.floor(Math.max(0, random()) * matches.length));
    const selected = matches[index]!;
    return {
      id: selected.id,
      letter,
      prompt: selected.prompt,
      answer: selected.expectedAnswer?.trim() ?? '',
      category: mapCategory(selected.categoryName),
      pattern: 'definition',
    };
  });
}
