export type LadderTeam = 'right' | 'left';

export type LadderRoomPhase = 'waiting' | 'intro' | 'active' | 'finished';

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
  revision?: number;
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
    introVersion?: 1;
  }>;
  introStartedAt?: number;
  introEndsAt?: number;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type LadderRoundAnswer = {
  optionId: string | null;
  correct: boolean;
  elapsedMs: number | null;
  points: number;
};
export type LadderRoundResult = {
  roundNumber: number;
  questionId: string;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string;
  right: LadderRoundAnswer;
  left: LadderRoundAnswer;
};

export type LadderRoomSnapshot = {
  roomCode: string;
  revision?: number;
  answerStatus?: { right: boolean; left: boolean };
  myAnswer?: string | null;
  roundResult?: LadderRoundResult | null;
  roundHistory?: LadderRoundResult[];
  winner?: 'right' | 'left' | 'draw' | null;
  winnerMethod?: 'position' | 'score' | 'time' | 'lottery' | null;
  questionDeadlineAt?: number | null;
  serverNow?: number;
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
  introStartedAt?: number;
  introEndsAt?: number;
  startedAt?: number;
  endedAt?: number;
};

export const LADDER_TTL_SECONDS = 3 * 60 * 60;
export const LADDER_ROOM_LOCK_MILLISECONDS = 10_000;
export const LADDER_MAX_TEAM_PLAYERS = 1;

const HANNIBAL_QUESTION =
  'من هو القائد القرطاجي الشهير الذي قاد جيشه مع الفيلة وعبر جبال الألب لمهاجمة روما؟';

/** Exclude the known imported copies, not the clean original or real chapter references. */
export function isKnownLadderQuestionDuplicate(prompt: string): boolean {
  const normalized = prompt.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const suffix = /\s*\(\s*فصل\s+[0-9٠-٩۰-۹]+\s*\)$/u.exec(normalized);
  return suffix !== null && normalized.slice(0, suffix.index) === HANNIBAL_QUESTION;
}
