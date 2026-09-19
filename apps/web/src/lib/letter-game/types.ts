export type TeamId = 'green' | 'orange';

export type GameStatus = 'playing' | 'question' | 'finished';

export type LetterQuestionCategory =
  | 'animals'
  | 'plants'
  | 'geography'
  | 'space'
  | 'science'
  | 'food-drink'
  | 'marine-life'
  | 'birds'
  | 'objects';

export type LetterQuestionPattern =
  | 'descriptive'
  | 'scenario'
  | 'comparison'
  | 'definition'
  | 'curiosity'
  | 'inference';

export interface LetterQuestion {
  id: string;
  letter: string;
  prompt: string;
  answer: string;
  category: LetterQuestionCategory;
  pattern: LetterQuestionPattern;
}

export interface BoardCell {
  id: string;
  row: number;
  column: number;
  letter: string;
  owner: TeamId | null;
}

export interface GameBoard {
  rows: number;
  columns: number;
  cells: readonly BoardCell[];
}

export type HistoryResult = 'correct' | 'wrong' | 'skipped' | 'timeout';

export interface GameHistoryEntry {
  id: string;
  team: TeamId;
  letter: string;
  result: HistoryResult;
  label: string;
}

export interface LetterGameState {
  currentTeam: TeamId;
  board: GameBoard;
  selectedCell: string | null;
  currentQuestion: LetterQuestion | null;
  timer: number;
  expiresAt: number | null;
  winner: TeamId | null;
  winningPath: readonly string[];
  gameStatus: GameStatus;
  history: readonly GameHistoryEntry[];
  round: number;
}
