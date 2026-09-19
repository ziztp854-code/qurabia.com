export type EliminationRoomPhase = 'waiting' | 'active' | 'between' | 'finished';

export type EliminationDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type EliminationQuestion = {
  id: string;
  prompt: string;
  options: string[];
  difficulty: EliminationDifficulty;
  correctIndex: number;
};

export type EliminationPlayer = {
  id: string;
  name: string;
  alive: boolean;
  eliminatedAtRound: number | null;
  answer: EliminationAnswer | null;
  joinedAt: number;
};

export type EliminationAnswer = {
  optionIndex: number;
  answeredAt: number;
};

export type EliminationRoom = {
  roomCode: string;
  hostId: string;
  status: EliminationRoomPhase;
  totalRounds: number;
  currentRound: number;
  roundTimeLimit: number;
  questionOrder: string[];
  usedQuestionIds: string[];
  currentQuestion: EliminationQuestion | null;
  questionOpenedAt: number | null;
  questionDeadlineAt: number | null;
  players: EliminationPlayer[];
  lastRoundResult: EliminationRoundResult | null;
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
  scoringPolicyVersion: number;
};

export type EliminationPlayerView = {
  id: string;
  name: string;
  alive: boolean;
  eliminatedAtRound: number | null;
  hasAnswered: boolean;
  isViewer: boolean;
};

export type EliminationRoundResult = {
  roundNumber: number;
  questionId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: EliminationDifficulty;
  survivorIds: string[];
  eliminatedIds: string[];
  everyoneCorrect: boolean;
};

export type EliminationRoomSnapshot = {
  roomCode: string;
  phase: EliminationRoomPhase;
  isHost: boolean;
  viewerPlayerId: string | null;
  currentRound: number;
  totalRounds: number;
  roundTimeLimit: number;
  aliveCount: number;
  players: EliminationPlayerView[];
  currentQuestion: {
    id: string;
    prompt: string;
    options: string[];
    difficulty: EliminationDifficulty;
    roundNumber: number;
    timeLimit: number;
  } | null;
  myAnswer: number | null;
  revealedCorrectIndex: number | null;
  remainingSeconds: number | null;
  lastRoundResult: EliminationRoundResult | null;
  startedAt?: number;
  endedAt?: number;
};

export const ELIMINATION_TTL_SECONDS = 3 * 60 * 60;
export const ELIMINATION_MAX_PLAYERS = 32;
export const ELIMINATION_MIN_PLAYERS = 2;
export const ELIMINATION_SCORING_POLICY_VERSION = 1;
export const ELIMINATION_MIN_ROUNDS = 3;
export const ELIMINATION_MAX_ROUNDS = 8;
export const ELIMINATION_ROUND_TIME_MIN = 10;
export const ELIMINATION_ROUND_TIME_MAX = 90;


/**
 * يحسم مصير اللاعبين الأحياء في جولة واحدة.
 * - من أجاب خطأ أو لم يجب: يُقصى.
 * - من أجاب صوابًا: ينجو.
 * - إن لم ينجُ أحد: يُنصّف السرب بأسرع الإجابات (أو اللاعب الواحد الأسرع).
 * - إن نجى الجميع: تُمرَّر الجولة كما هي (نجاة جماعية).
 */
export function resolveEliminationRound(
  alivePlayers: readonly EliminationPlayer[],
  correctIndex: number,
): { survivorIds: string[]; eliminatedIds: string[]; everyoneCorrect: boolean } {
  const survivors: EliminationPlayer[] = [];
  const eliminated: EliminationPlayer[] = [];
  for (const player of alivePlayers) {
    if (player.answer && player.answer.optionIndex === correctIndex) {
      survivors.push(player);
    } else {
      eliminated.push(player);
    }
  }

  if (survivors.length > 0) {
    return {
      survivorIds: survivors.map((player) => player.id),
      eliminatedIds: eliminated.map((player) => player.id),
      everyoneCorrect: eliminated.length === 0,
    };
  }

  // لا أحد أجاب صوابًا: النجاة لأسرع النصف (على الأقل لاعب واحد).
  const keepCount = Math.max(1, Math.ceil(eliminated.length / 2));
  const fastest = [...eliminated]
    .sort((a, b) => (a.answer?.answeredAt ?? Number.MAX_SAFE_INTEGER) - (b.answer?.answeredAt ?? Number.MAX_SAFE_INTEGER))
    .slice(0, keepCount);
  const fastestIds = new Set(fastest.map((player) => player.id));
  return {
    survivorIds: fastest.map((player) => player.id),
    eliminatedIds: eliminated.filter((player) => !fastestIds.has(player.id)).map((player) => player.id),
    everyoneCorrect: false,
  };
}

export function difficultyForRound(round: number, totalRounds: number): EliminationDifficulty {
  if (totalRounds <= 1) return 'MEDIUM';
  const ratio = (round - 1) / (totalRounds - 1);
  if (ratio <= 0.34) return 'EASY';
  if (ratio <= 0.75) return 'MEDIUM';
  return 'HARD';
}

export function buildEliminationRoomSnapshot(
  room: EliminationRoom,
  viewerPlayerId: string | null,
  isHost: boolean,
  now = Date.now(),
): EliminationRoomSnapshot {
  const remainingSeconds =
    room.questionDeadlineAt == null || room.status !== 'active'
      ? null
      : Math.max(0, Math.ceil((room.questionDeadlineAt - now) / 1000));
  const viewerPlayer = room.players.find((player) => player.id === viewerPlayerId) ?? null;
  const revealCorrect =
    room.status === 'finished' || room.status === 'between'
      ? room.lastRoundResult?.correctIndex ?? null
      : null;
  return {
    roomCode: room.roomCode,
    phase: room.status,
    isHost,
    viewerPlayerId: viewerPlayer ? viewerPlayer.id : null,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    roundTimeLimit: room.roundTimeLimit,
    aliveCount: room.players.filter((player) => player.alive).length,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      eliminatedAtRound: player.eliminatedAtRound,
      hasAnswered: player.answer != null,
      isViewer: player.id === viewerPlayerId,
    })),
    currentQuestion:
      room.currentQuestion && room.status !== 'waiting'
        ? {
            id: room.currentQuestion.id,
            prompt: room.currentQuestion.prompt,
            options: [...room.currentQuestion.options],
            difficulty: room.currentQuestion.difficulty,
            roundNumber: room.currentRound,
            timeLimit: room.roundTimeLimit,
          }
        : null,
    myAnswer: viewerPlayer?.answer?.optionIndex ?? null,
    revealedCorrectIndex: revealCorrect,
    remainingSeconds,
    lastRoundResult: room.lastRoundResult ? { ...room.lastRoundResult } : null,
    startedAt: room.startedAt,
    endedAt: room.endedAt,
  };
}
