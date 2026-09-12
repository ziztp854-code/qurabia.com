function seedToUint32(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const QUIZ_DRAW_POINTS = { EASY: 500, MEDIUM: 700, HARD: 1000 } as const;

/** Draws one question per category each round, with random category and question order. */
export function selectCategoryBalancedQuestions(
  candidates: readonly { id: string; categoryId: string | null }[],
  seed: string,
  limit: number,
): string[] {
  const byId = new Map(candidates.map((question) => [question.id, question]));
  const categories = new Map<string, string[]>();
  for (const id of selectRandomQuestionIds([...byId.keys()], seed, byId.size)) {
    const category = byId.get(id)!.categoryId ?? '';
    const bucket = categories.get(category);
    if (bucket) bucket.push(id);
    else categories.set(category, [id]);
  }
  const order = selectRandomQuestionIds(
    [...categories.keys()],
    `${seed}:categories`,
    categories.size,
  );
  const selected: string[] = [];
  for (let round = 0; selected.length < Math.min(limit, byId.size); round += 1) {
    for (const category of order) {
      const id = categories.get(category)![round];
      if (id && selected.length < limit) selected.push(id);
    }
  }
  return selected;
}

function createSeededRandom(seed: string): () => number {
  let state = seedToUint32(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Selects a deterministic random sample without mutating the source IDs. */
export function selectRandomQuestionIds(
  ids: readonly string[],
  seed: string,
  limit: number,
): string[] {
  const pool = [...new Set(ids)];
  const random = createSeededRandom(seed);

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = pool[index];
    pool[index] = pool[swapIndex];
    pool[swapIndex] = current;
  }

  return pool.slice(0, Math.max(0, limit));
}

export function selectRandomQuestionsByDifficulty(
  candidates: readonly { id: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }[],
  counts: Readonly<Record<'EASY' | 'MEDIUM' | 'HARD', number>>,
  seed: string,
): string[] {
  return (['EASY', 'MEDIUM', 'HARD'] as const).flatMap((difficulty) =>
    selectRandomQuestionIds(
      candidates
        .filter((candidate) => candidate.difficulty === difficulty)
        .map((candidate) => candidate.id),
      `${seed}:${difficulty}`,
      counts[difficulty],
    ),
  );
}
