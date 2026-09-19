import type { DatabaseService } from '../game/database.service.js';
import type { ScrambledWordsPuzzle } from '@tahaddi/domain';

const MAX_PUZZLE_POOL = 120;

type PuzzleRow = {
  id: string;
  imageUrl: string;
  words: string[];
};

function sanitizeWords(words: string[]): string[] {
  const cleaned = words
    .map((word) => word.trim().replace(/\s+/g, ' '))
    .filter((word) => word.length >= 2 && word.length <= 40);
  return [...new Set(cleaned)];
}

export async function loadScrambledWordsPuzzles(
  database: DatabaseService,
): Promise<ScrambledWordsPuzzle[]> {
  const rows = await database.client.scrambledWordsPuzzle.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true,
      imageUrl: true,
      words: true,
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: MAX_PUZZLE_POOL * 3,
  });

  return (rows as PuzzleRow[])
    .map((row) => ({
      id: row.id,
      imageUrl: row.imageUrl,
      words: sanitizeWords(row.words ?? []),
    }))
    .filter(
      (puzzle) =>
        puzzle.imageUrl.length > 0 &&
        puzzle.words.length >= 1 &&
        puzzle.words.length <= 12,
    )
    .slice(0, MAX_PUZZLE_POOL);
}
