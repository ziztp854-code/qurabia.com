export type LeaderboardPlayer = {
  id: string;
  name: string;
  score: number;
  rank: number;
  streak?: number;
  correctAnswers?: number;
};

export type LeaderboardPayload = {
  ok: true;
  players: LeaderboardPlayer[];
  updatedAt: string;
  finishedSessions: number;
};
