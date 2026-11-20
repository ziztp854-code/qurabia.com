import { BOARD_LETTERS, LETTER_QUESTION_POOL } from '@/lib/letter-game/questions';
import type { LetterQuestion, LetterQuestionCategory } from '@/lib/letter-game/types';
import { foldKeyword } from '@/lib/questions/keywords';
import type { QuestionFeedRow } from '../types';

const LETTER_MARKER = 'حرف:';

function readAnswer(row: QuestionFeedRow): string | undefined {
  if (row.type === 'SHORT_ANSWER') return row.expectedAnswer?.trim();
  if (row.type !== 'MULTIPLE_CHOICE') return undefined;

  const correctOptions = row.options.filter((option) => option.isCorrect);
  return correctOptions.length === 1 ? correctOptions[0].text.trim() : undefined;
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
  const candidates = new Map<string, LetterQuestion[]>();

  for (const row of rows) {
    const answer = readAnswer(row);
    if (!answer) continue;
    const initial = foldKeyword(answer)[0];
    const letter = BOARD_LETTERS.find((candidate) => foldKeyword(candidate) === initial);
    if (!letter) continue;

    const letterMarkers = row.keywords.filter((keyword) => keyword.startsWith(LETTER_MARKER));
    if (letterMarkers.some((marker) => foldKeyword(marker.slice(LETTER_MARKER.length)) !== initial)) {
      continue;
    }

    const matches = candidates.get(letter) ?? [];
    matches.push({
      id: row.id,
      letter,
      prompt: row.prompt,
      answer,
      category: mapCategory(row.categoryName),
      pattern: 'definition',
    });
    candidates.set(letter, matches);
  }

  return BOARD_LETTERS.flatMap((letter) => {
    const matches = candidates.get(letter) ?? [];
    if (matches.length === 0)
      return LETTER_QUESTION_POOL.filter((question) => question.letter === letter);
    const index = Math.min(matches.length - 1, Math.floor(Math.max(0, random()) * matches.length));
    // Keep all candidates so the host can replace a question without reloading the page.
    return [...matches.slice(index), ...matches.slice(0, index)];
  });
}
