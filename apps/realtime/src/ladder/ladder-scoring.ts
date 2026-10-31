import type { LadderQuestionDifficulty } from '@tahaddi/domain';

const BASE = { EASY: 600, MEDIUM: 1200, HARD: 1800 } as const;
const PENALTY = { EASY: 150, MEDIUM: 300, HARD: 450 } as const;

/** Server receipt time determines speed. Network latency is not compensated. */
export function scoreLadderAnswer(
  difficulty: LadderQuestionDifficulty,
  correct: boolean,
  elapsedMs: number,
  limitMs: number,
): number {
  if (!correct) return -PENALTY[difficulty];
  const fraction = Math.max(
    0,
    Math.min(1, 1 - elapsedMs / Math.max(1, limitMs)),
  );
  return BASE[difficulty] + Math.floor(600 * fraction);
}

export function resolveLadderWinner(
  rightPosition: number,
  leftPosition: number,
  rightScore: number,
  leftScore: number,
  rightCorrectMs: number,
  leftCorrectMs: number,
  rightCorrectCount: number,
  leftCorrectCount: number,
  lottery: () => 'right' | 'left',
): {
  winner: 'right' | 'left';
  winnerMethod: 'position' | 'score' | 'time' | 'lottery';
} {
  if (rightPosition !== leftPosition)
    return {
      winner: rightPosition > leftPosition ? 'right' : 'left',
      winnerMethod: 'position',
    };
  if (rightScore !== leftScore)
    return {
      winner: rightScore > leftScore ? 'right' : 'left',
      winnerMethod: 'score',
    };
  if (rightCorrectCount !== 0 && leftCorrectCount === 0)
    return { winner: 'right', winnerMethod: 'time' };
  if (leftCorrectCount !== 0 && rightCorrectCount === 0)
    return { winner: 'left', winnerMethod: 'time' };
  const rightScaled = rightCorrectMs * leftCorrectCount;
  const leftScaled = leftCorrectMs * rightCorrectCount;
  if (rightScaled !== leftScaled)
    return {
      winner: rightScaled < leftScaled ? 'right' : 'left',
      winnerMethod: 'time',
    };
  return { winner: lottery(), winnerMethod: 'lottery' };
}
