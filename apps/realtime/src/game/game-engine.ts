import { ANSWER_ACCEPT_GRACE_MS, type GamePhase } from '@tahaddi/contracts';

const TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  LOBBY: ['QUESTION', 'FINISHED'],
  QUESTION: ['REVEAL', 'FINISHED'],
  REVEAL: ['LEADERBOARD', 'FINISHED'],
  LEADERBOARD: ['QUESTION', 'FINISHED'],
  FINISHED: [],
};

export function canTransition(from: GamePhase, to: GamePhase) {
  return TRANSITIONS[from].includes(to);
}

export function calculateQuestionScore(input: {
  correct: boolean;
  basePoints: number;
  questionStartedAt: number;
  questionEndsAt: number;
  receivedAt: number;
}) {
  if (
    !input.correct ||
    input.receivedAt < input.questionStartedAt - ANSWER_ACCEPT_GRACE_MS ||
    input.receivedAt > input.questionEndsAt
  ) {
    return 0;
  }

  const duration = Math.max(1, input.questionEndsAt - input.questionStartedAt);
  const elapsed = Math.max(0, input.receivedAt - input.questionStartedAt);
  const remainingRatio = Math.max(0, 1 - elapsed / duration);
  const speedFactor = 0.5 + remainingRatio * 0.5;
  return Math.max(0, Math.round(input.basePoints * speedFactor));
}
