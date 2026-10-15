export const QUIZ_DIFFICULTY_POINTS = { EASY: 500, MEDIUM: 700, HARD: 1000 } as const;
export type QuizQuestionDifficulty = keyof typeof QUIZ_DIFFICULTY_POINTS;

/** Maximum base score before the existing server-side speed adjustment. */
export function getQuizQuestionPoints(difficulty: QuizQuestionDifficulty): number {
  return QUIZ_DIFFICULTY_POINTS[difficulty];
}
