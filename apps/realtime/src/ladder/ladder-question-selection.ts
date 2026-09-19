export type LadderDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type LadderQuestionCandidate = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  prompt: string;
  difficulty: LadderDifficulty;
  category: { id: string; name: string };
  timeLimit: number;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
};

export type LadderQuestionSelectionTier = 'A' | 'B' | 'C' | 'D' | 'E';

type SelectLadderQuestionCandidateInput = {
  candidates: LadderQuestionCandidate[];
  targetDifficulty: LadderDifficulty;
  usedQuestionIds: string[];
  recentCategoryIds: string[];
  /** Injected for tests; defaults to Math.random. */
  random?: () => number;
};

function pickRandomCandidate(
  matches: LadderQuestionCandidate[],
  random: () => number,
): LadderQuestionCandidate {
  const index = Math.min(
    matches.length - 1,
    Math.max(0, Math.floor(random() * matches.length)),
  );
  const candidate = matches[index];
  if (!candidate) {
    throw new Error('No ladder question candidates available');
  }
  return candidate;
}

const ADJACENT_DIFFICULTIES: Record<LadderDifficulty, LadderDifficulty[]> = {
  EASY: ['MEDIUM'],
  MEDIUM: ['EASY', 'HARD'],
  HARD: ['MEDIUM'],
};

export function getLadderDifficulty(
  roundNumber: number,
  totalRounds: number,
): LadderDifficulty {
  const boundedTotal = Math.max(1, Math.trunc(totalRounds));
  const boundedRound = Math.min(
    boundedTotal,
    Math.max(1, Math.trunc(roundNumber)),
  );
  const progress = boundedRound / boundedTotal;

  if (progress <= 0.3) return 'EASY';
  if (progress <= 0.7) return 'MEDIUM';
  return 'HARD';
}

export function isValidLadderQuestionCandidate(
  candidate: LadderQuestionCandidate,
): boolean {
  const optionCount = candidate.options.length;
  const correctOptions = candidate.options.filter((option) => option.isCorrect);
  const uniqueOptionIds = new Set(candidate.options.map((option) => option.id));
  const normalizedOptionTexts = candidate.options.map((option) =>
    option.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar'),
  );
  const uniqueOptionTexts = new Set(normalizedOptionTexts);
  const prompt = candidate.prompt.trim().replace(/\s+/g, ' ');
  const isPlaceholder =
    /^سؤال\s+الجولة(?:\s|$)/u.test(prompt) ||
    /^سؤال\s+\d+\s+من\s+\d+$/u.test(prompt) ||
    candidate.options.some((option) =>
      /^إجابة\s+[أ-ي]$/u.test(option.text.trim()),
    );
  const validOptionCount =
    candidate.type === 'TRUE_FALSE'
      ? optionCount === 2
      : optionCount >= 3 && optionCount <= 4;

  return (
    prompt.length >= 8 &&
    !isPlaceholder &&
    validOptionCount &&
    correctOptions.length === 1 &&
    uniqueOptionIds.size === optionCount &&
    uniqueOptionTexts.size === optionCount &&
    candidate.options.every((option) => option.text.trim().length > 0) &&
    Number.isFinite(candidate.timeLimit) &&
    candidate.timeLimit > 0
  );
}

export function selectLadderQuestionCandidate({
  candidates,
  targetDifficulty,
  usedQuestionIds,
  recentCategoryIds,
  random = Math.random,
}: SelectLadderQuestionCandidateInput): {
  candidate: LadderQuestionCandidate;
  tier: LadderQuestionSelectionTier;
} | null {
  const usedIds = new Set(usedQuestionIds);
  const available = candidates.filter(
    (candidate) =>
      !usedIds.has(candidate.id) && isValidLadderQuestionCandidate(candidate),
  );
  if (available.length === 0) return null;

  const previousCategoryId = recentCategoryIds.at(-1);
  const hasDifferentCategory = (candidate: LadderQuestionCandidate) =>
    previousCategoryId === undefined ||
    candidate.category.id !== previousCategoryId;
  const isAdjacent = (candidate: LadderQuestionCandidate) =>
    ADJACENT_DIFFICULTIES[targetDifficulty].includes(candidate.difficulty);

  const tiers: Array<{
    tier: LadderQuestionSelectionTier;
    predicate: (candidate: LadderQuestionCandidate) => boolean;
  }> = [
    {
      tier: 'A',
      predicate: (candidate) =>
        candidate.difficulty === targetDifficulty &&
        hasDifferentCategory(candidate),
    },
    {
      tier: 'B',
      predicate: (candidate) => candidate.difficulty === targetDifficulty,
    },
    {
      tier: 'C',
      predicate: (candidate) =>
        isAdjacent(candidate) && hasDifferentCategory(candidate),
    },
    { tier: 'D', predicate: isAdjacent },
    { tier: 'E', predicate: () => true },
  ];

  for (const tier of tiers) {
    const matches = available.filter(tier.predicate);
    if (matches.length > 0) {
      return {
        candidate: pickRandomCandidate(matches, random),
        tier: tier.tier,
      };
    }
  }

  return null;
}
