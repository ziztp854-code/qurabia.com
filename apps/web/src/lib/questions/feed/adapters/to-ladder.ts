import type { QuestionFeedRow } from '../types';

export type LadderFeedCandidate = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  prompt: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  category: { id: string; name: string };
  timeLimit: number;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
};

export function adaptFeedToLadderCandidates(
  rows: readonly QuestionFeedRow[],
): LadderFeedCandidate[] {
  return rows.flatMap((row) => {
    if (row.type !== 'MULTIPLE_CHOICE' && row.type !== 'TRUE_FALSE') return [];
    const options = row.options.filter((option) => option.text.trim().length > 0);
    if (options.length < 2 || !options.some((option) => option.isCorrect)) return [];

    return [
      {
        id: row.id,
        type: row.type,
        prompt: row.prompt,
        difficulty: row.difficulty,
        category: {
          id: row.categoryId ?? `cat-${row.id}`,
          name: row.categoryName,
        },
        timeLimit: row.timeLimit,
        options: options.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      },
    ];
  });
}
