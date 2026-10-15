import { getQuizQuestionPoints, type QuizQuestionDifficulty } from '@tahaddi/domain';

export function resolveQuizQuestion<
  TQuestion extends { timeLimit: number; basePoints: number; difficulty: QuizQuestionDifficulty },
>(quizQuestion: {
  durationOverride: number | null;
  pointsOverride: number | null;
  question: TQuestion;
}): TQuestion {
  return {
    ...quizQuestion.question,
    timeLimit: quizQuestion.durationOverride ?? quizQuestion.question.timeLimit,
    basePoints: getQuizQuestionPoints(quizQuestion.question.difficulty),
  };
}
