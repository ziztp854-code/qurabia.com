import type { QuizBuilderGameMode } from '@/lib/quizzes/quiz-draft';

export type QuestionFeedGameMode = QuizBuilderGameMode;

export type QuestionFeedSource =
  | { kind: 'quiz-pack'; quizId: string; gameMode: QuestionFeedGameMode }
  | { kind: 'bank-tags'; gameMode: QuestionFeedGameMode; take?: number };

export type QuestionFeedOption = {
  id: string;
  text: string;
  isCorrect: boolean;
  position: number;
};

export type QuestionFeedRow = {
  id: string;
  prompt: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  expectedAnswer: string | null;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  categoryId: string | null;
  categoryName: string;
  timeLimit: number;
  basePoints: number;
  keywords: string[];
  explanation: string | null;
  options: QuestionFeedOption[];
  position: number;
};

export type QuestionFeedResult = {
  source: QuestionFeedSource['kind'];
  gameMode: QuestionFeedGameMode;
  quizId: string | null;
  quizTitle: string | null;
  rows: QuestionFeedRow[];
};

export type QuizPackSummary = {
  id: string;
  title: string;
  roomCode: string;
  questionCount: number;
  updatedAt: string;
};

export class QuestionFeedError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'MODE_MISMATCH' | 'EMPTY' | 'UNAVAILABLE',
  ) {
    super(message);
    this.name = 'QuestionFeedError';
  }
}

export const GAME_PLAY_PATHS: Readonly<Record<QuestionFeedGameMode, string>> = {
  QUIZ: '/host',
  LADDER: '/games/ladder/host',
  LETTER_CHALLENGE: '/games/letter-challenge',
  MILLIONAIRE: '/games/millionaire',
  CATEGORY_BOARD: '/games/category-board',
};

export function playHrefForPack(gameMode: QuestionFeedGameMode, quizId?: string | null): string {
  const base = GAME_PLAY_PATHS[gameMode];
  if (gameMode === 'QUIZ' || !quizId) return base;
  return `${base}?quizId=${encodeURIComponent(quizId)}`;
}
