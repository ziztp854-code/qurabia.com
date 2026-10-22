export type QuizAccountBoundary = { authenticated: boolean; generation: number };

/** Guest participation survives anonymous refreshes; an account switch dismisses its open quiz. */
export function shouldDismissQuiz(previous: QuizAccountBoundary, next: QuizAccountBoundary) {
  return previous.authenticated && (!next.authenticated || previous.generation !== next.generation);
}
