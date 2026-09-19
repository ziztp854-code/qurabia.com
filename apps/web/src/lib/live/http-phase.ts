import type { GamePhase } from '@tahaddi/contracts';

export function deriveHttpGamePhase({
  status,
  questionStartedAt,
  questionEndsAt,
  questionAdvanceAt,
  allAnswered,
  now,
}: {
  status: 'WAITING' | 'ACTIVE' | 'FINISHED';
  questionStartedAt: number | null;
  questionEndsAt: number | null;
  questionAdvanceAt: number | null;
  allAnswered: boolean;
  now: number;
}): GamePhase {
  if (status === 'WAITING') return 'LOBBY';
  if (status === 'FINISHED') return 'FINISHED';
  if (!questionStartedAt || !questionEndsAt) return 'LOBBY';
  if (questionAdvanceAt || allAnswered || now >= questionEndsAt) return 'REVEAL';
  return 'QUESTION';
}
