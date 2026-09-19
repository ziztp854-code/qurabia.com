function seedToUint32(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
