import type { SpecialGamePlayer } from './types.js';

export function selectInfiltratorId(
  players: Pick<SpecialGamePlayer, 'id'>[],
  random: () => number = Math.random,
) {
  if (players.length === 0) return null;
  const index = Math.min(
    players.length - 1,
    Math.floor(random() * players.length),
  );
  return players[index]?.id ?? null;
}

export function resolveInfiltratorRound({
  players,
  infiltratorId,
  votes,
  majorityGuess,
  majorityQuestion,
}: {
  players: Pick<SpecialGamePlayer, 'id'>[];
  infiltratorId: string;
  votes: Record<string, string>;
  majorityGuess: string | null;
  majorityQuestion: string;
}) {
  const voteCounts = Object.values(votes).reduce<Record<string, number>>(
    (counts, playerId) => {
      counts[playerId] = (counts[playerId] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const highestVoteCount = Math.max(0, ...Object.values(voteCounts));
  const mostVotedIds = Object.entries(voteCounts)
    .filter(([, count]) => count === highestVoteCount)
    .map(([playerId]) => playerId);
  const caught = mostVotedIds.length === 1 && mostVotedIds[0] === infiltratorId;
  const survived = !caught;
  const guessedMajority = majorityGuess === majorityQuestion;
  const infiltratorWon = survived || guessedMajority;
  const scoreDeltas = Object.fromEntries(
    players.map((player) => [player.id, 0]),
  );

  for (const [voterId, targetId] of Object.entries(votes)) {
    if (voterId !== infiltratorId && targetId === infiltratorId) {
      scoreDeltas[voterId] = (scoreDeltas[voterId] ?? 0) + 10;
    }
  }
  if (survived)
    scoreDeltas[infiltratorId] = (scoreDeltas[infiltratorId] ?? 0) + 20;
  if (guessedMajority)
    scoreDeltas[infiltratorId] = (scoreDeltas[infiltratorId] ?? 0) + 10;

  return {
    caught,
    survived,
    guessedMajority,
    infiltratorWon,
    voteCounts,
    scoreDeltas,
  };
}
