export type LadderTeam = 'right' | 'left';

export type LadderRoomPhase = 'waiting' | 'active' | 'finished';

export type LadderQuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type LadderQuestion = {
  id: string;
  roomId: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  category: { id: string; name: string };
  difficulty: LadderQuestionDifficulty;
  timeLimit: number;
  roundNumber: number;
  createdAt: number;
};

export type LadderRoom = {
  roomCode: string;
  hostId: string;
  status: LadderRoomPhase;
  currentRound: number;
  totalRounds: number;
  rightScore: number;
  leftScore: number;
  rightPosition: number;
  leftPosition: number;
  winningPosition: number;
  questionTimeLimit?: number;
  /** Optional curated quiz pack used as the primary question feed. */
  quizId?: string | null;
  currentQuestion: LadderQuestion | null;
  teams: Array<{
    id: string;
    team: LadderTeam;
    playerName: string;
    isHost: boolean;
    joinedAt: number;
  }>;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type LadderRoomSnapshot = {
  roomCode: string;
  phase: LadderRoomPhase;
  currentRound: number;
  totalRounds: number;
  rightScore: number;
  leftScore: number;
  rightPosition: number;
  leftPosition: number;
  winningPosition: number;
  questionTimeLimit: number;
  currentQuestion: LadderQuestion | null;
  rightTeam: Array<{ playerName: string; isHost: boolean }>;
  leftTeam: Array<{ playerName: string; isHost: boolean }>;
  isHost: boolean;
  startedAt?: number;
  endedAt?: number;
};

export const LADDER_TTL_SECONDS = 3 * 60 * 60;
export const LADDER_ROOM_LOCK_MILLISECONDS = 10_000;
export const LADDER_MAX_TEAM_PLAYERS = 10;
