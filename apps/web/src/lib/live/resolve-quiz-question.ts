export function resolveQuizQuestion<
  TQuestion extends { timeLimit: number; basePoints: number },
>(quizQuestion: {
  durationOverride: number | null;
  pointsOverride: number | null;
  question: TQuestion;
}): TQuestion {
  return {
    ...quizQuestion.question,
    timeLimit: quizQuestion.durationOverride ?? quizQuestion.question.timeLimit,
    basePoints: quizQuestion.pointsOverride ?? quizQuestion.question.basePoints,
  };
}
