import { foldKeyword } from './keywords';

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
  candidates: readonly { id: string; prompt: string; categoryId: string | null }[],
  seed: string,
  limit: number,
  excludeIds: readonly string[] = [],
): string[] {
  const byId = new Map(candidates.map((question) => [question.id, question]));
  const excluded = new Set(excludeIds);
  const seenPrompts = new Set(
    candidates
      .filter((question) => excluded.has(question.id))
      .map((question) => foldKeyword(question.prompt) || question.id),
  );
  const categories = new Map<string, string[]>();
  for (const id of selectRandomQuestionIds([...byId.keys()], seed, byId.size)) {
    if (excluded.has(id)) continue;
    const category = byId.get(id)!.categoryId ?? '';
    const bucket = categories.get(category);
    if (bucket) bucket.push(id);
    else categories.set(category, [id]);
  }
  const order = selectRandomQuestionIds(
    [...categories.keys()],
    `${seed}:categories`,
    categories.size,
  ).sort((left, right) => categories.get(left)!.length - categories.get(right)!.length);
  const selected: string[] = [];
  while (selected.length < Math.max(0, limit)) {
    let added = false;
    for (const category of order) {
      const bucket = categories.get(category)!;
      while (bucket.length > 0 && selected.length < limit) {
        const id = bucket.pop()!;
        const prompt = foldKeyword(byId.get(id)!.prompt) || id;
        if (seenPrompts.has(prompt)) continue;
        seenPrompts.add(prompt);
        selected.push(id);
        added = true;
        break;
      }
    }
    if (!added) break;
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
  candidates: readonly {
    id: string;
    prompt: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  }[],
  counts: Readonly<Record<'EASY' | 'MEDIUM' | 'HARD', number>>,
  seed: string,
  excludeIds: readonly string[] = [],
): string[] {
  const excluded = new Set(excludeIds);
  const excludedPrompts = new Set(
    candidates
      .filter((candidate) => excluded.has(candidate.id))
      .map((candidate) => foldKeyword(candidate.prompt) || candidate.id),
  );
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const difficulties = ['EASY', 'MEDIUM', 'HARD'] as const;
  const idsByPrompt = Object.fromEntries(
    difficulties.map((difficulty) => {
      const ids = selectRandomQuestionIds(
        candidates
          .filter((candidate) => candidate.difficulty === difficulty && !excluded.has(candidate.id))
          .map((candidate) => candidate.id),
        `${seed}:${difficulty}`,
        candidates.length,
      );
      const unique = new Map<string, string>();
      for (const id of ids) {
        const prompt = foldKeyword(byId.get(id)!.prompt) || id;
        if (!excludedPrompts.has(prompt) && !unique.has(prompt)) unique.set(prompt, id);
      }
      return [difficulty, unique];
    }),
  ) as Record<(typeof difficulties)[number], Map<string, string>>;
  const slots = difficulties
    .flatMap((difficulty) => Array.from({ length: counts[difficulty] }, () => difficulty))
    .sort(
      (left, right) => idsByPrompt[left].size - idsByPrompt[right].size,
    );
  const promptAssignments = new Map<string, number>();

  const assign = (slot: number, visited: Set<string>): boolean => {
    for (const prompt of idsByPrompt[slots[slot]].keys()) {
      if (visited.has(prompt)) continue;
      visited.add(prompt);
      const previousSlot = promptAssignments.get(prompt);
      if (previousSlot === undefined || assign(previousSlot, visited)) {
        promptAssignments.set(prompt, slot);
        return true;
      }
    }
    return false;
  };

  slots.forEach((_, slot) => assign(slot, new Set()));
  const selectedBySlot = new Map<number, string>();
  for (const [prompt, slot] of promptAssignments) {
    const id = idsByPrompt[slots[slot]].get(prompt);
    if (id) selectedBySlot.set(slot, id);
  }
  return slots.flatMap((_, slot) => {
    const id = selectedBySlot.get(slot);
    return id ? [id] : [];
  });
}
