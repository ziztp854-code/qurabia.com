export type ScrambledWordsRoomPhase = 'waiting' | 'active' | 'finished';

export type ScrambledWordsPuzzle = {
  id: string;
  imageUrl: string;
  words: string[];
};

export type ScrambledWordsPlayer = {
  id: string;
  name: string;
  score: number;
  roundScore: number;
  solvedWords: string[];
  finished: boolean;
  joinedAt: number;
};

export type ScrambledWordsRoom = {
  roomCode: string;
  hostId: string;
  status: ScrambledWordsRoomPhase;
  totalRounds: number;
  currentRound: number;
  roundTimeLimit: number;
  firstFinish: boolean;
  puzzleOrder: string[];
  usedPuzzleIds: string[];
  currentPuzzle: ScrambledWordsPuzzle | null;
  currentFragments: string[] | null;
  puzzleOpenedAt: number | null;
  puzzleDeadlineAt: number | null;
  players: ScrambledWordsPlayer[];
  lastRoundWords: string[];
  lastRoundResults: ScrambledWordsRoundResult[];
  startedAt?: number;
  endedAt?: number;
  createdAt: number;
  updatedAt: number;
  scoringPolicyVersion: number;
};

export type ScrambledWordsPlayerView = {
  id: string;
  name: string;
  score: number;
  roundScore: number;
  solvedCount: number;
  wordCount: number;
  finished: boolean;
  isViewer: boolean;
};

export type ScrambledWordsRoundResult = {
  id: string;
  name: string;
  roundScore: number;
  totalScore: number;
};

export type ScrambledWordsRoomSnapshot = {
  roomCode: string;
  phase: ScrambledWordsRoomPhase;
  isHost: boolean;
  viewerPlayerId: string | null;
  currentRound: number;
  totalRounds: number;
  roundTimeLimit: number;
  firstFinish: boolean;
  players: ScrambledWordsPlayerView[];
  currentPuzzle: {
    id: string;
    imageUrl: string;
    fragments: string[];
    wordLengths: number[];
    timeLimit: number;
    roundNumber: number;
  } | null;
  mySolvedWords: string[];
  remainingSeconds: number | null;
  lastRoundWords: string[];
  lastRoundResults: ScrambledWordsRoundResult[];
  startedAt?: number;
  endedAt?: number;
};

export const SCRAMBLED_WORDS_TTL_SECONDS = 3 * 60 * 60;
export const SCRAMBLED_WORDS_MAX_PLAYERS = 24;
export const SCRAMBLED_WORDS_SCORING_POLICY_VERSION = 1;
export const SCRAMBLED_WORDS_POINTS_PER_WORD = 1;
export const SCRAMBLED_WORDS_MAX_WORDS_PER_PUZZLE = 12;
export const SCRAMBLED_WORDS_MAX_FRAGMENTS = 40;

export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const first = result[i] as T;
    const second = result[j] as T;
    result[i] = second;
    result[j] = first;
  }
  return result;
}

function fragmentCountForLength(length: number): number {
  if (length <= 3) return 2;
  if (length <= 5) return 3;
  if (length <= 8) return 4;
  return 5;
}

export function splitWordIntoFragments(
  word: string,
  random: () => number = Math.random,
): string[] {
  const letters = Array.from(word.replace(/\s+/g, ''));
  if (letters.length < 2) return [word.trim()];
  const count = Math.min(
    letters.length,
    Math.max(2, fragmentCountForLength(letters.length)),
  );

  const cutCandidates: number[] = [];
  for (let position = 1; position < letters.length; position += 1) {
    cutCandidates.push(position);
  }
  const chosenCuts = shuffled(cutCandidates, random)
    .slice(0, count - 1)
    .sort((a, b) => a - b);

  const fragments: string[] = [];
  let start = 0;
  for (const cut of chosenCuts) {
    fragments.push(letters.slice(start, cut).join(''));
    start = cut;
  }
  fragments.push(letters.slice(start).join(''));
  return fragments;
}

export function buildScrambledWordsFragments(
  words: readonly string[],
  random: () => number = Math.random,
): string[] {
  const fragments = words.flatMap((word) =>
    splitWordIntoFragments(word, random),
  );
  return shuffled(fragments, random);
}

export function normalizeArabicWord(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u0640\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase('ar');
}

export function isScrambledWordsWordSolved(
  word: string,
  solvedWords: readonly string[],
): boolean {
  const normalized = normalizeArabicWord(word);
  return solvedWords.some(
    (candidate) => normalizeArabicWord(candidate) === normalized,
  );
}

export function buildScrambledWordsRoomSnapshot(
  room: ScrambledWordsRoom,
  viewerPlayerId: string | null,
  isHost: boolean,
  now = Date.now(),
): ScrambledWordsRoomSnapshot {
  const remainingSeconds =
    room.puzzleDeadlineAt == null
      ? null
      : Math.max(0, Math.ceil((room.puzzleDeadlineAt - now) / 1000));
  const viewerPlayer =
    room.players.find((player) => player.id === viewerPlayerId) ?? null;
  return {
    roomCode: room.roomCode,
    phase: room.status,
    isHost,
    viewerPlayerId: viewerPlayer ? viewerPlayer.id : null,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    roundTimeLimit: room.roundTimeLimit,
    firstFinish: room.firstFinish,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      roundScore: player.roundScore,
      solvedCount: player.solvedWords.length,
      wordCount: room.currentPuzzle?.words.length ?? 0,
      finished: player.finished,
      isViewer: player.id === viewerPlayerId,
    })),
    currentPuzzle:
      room.currentPuzzle && room.currentFragments
        ? {
            id: room.currentPuzzle.id,
            imageUrl: room.currentPuzzle.imageUrl,
            fragments: [...room.currentFragments],
            wordLengths: room.currentPuzzle.words.map(
              (word) => Array.from(word.replace(/\s+/g, '')).length,
            ),
            timeLimit: room.roundTimeLimit,
            roundNumber: room.currentRound,
          }
        : null,
    mySolvedWords: viewerPlayer ? [...viewerPlayer.solvedWords] : [],
    remainingSeconds,
    lastRoundWords: room.lastRoundWords ? [...room.lastRoundWords] : [],
    lastRoundResults: room.lastRoundResults
      ? room.lastRoundResults.map((result) => ({ ...result }))
      : [],
    startedAt: room.startedAt,
    endedAt: room.endedAt,
  };
}
