import { claimCell, createLetterBoard, findWinningPath, getCell, switchTeam } from './engine';
import { BOARD_LETTERS, getQuestionForLetter } from './questions';
import type { HistoryResult, LetterGameState, LetterQuestion } from './types';

export type LetterGameAction =
  | { type: 'select-cell'; cellId: string; now: number; question?: LetterQuestion }
  | { type: 'judge'; result: Exclude<HistoryResult, 'timeout'>; now: number }
  | { type: 'tick'; now: number }
  | { type: 'reset' };

export function createInitialLetterGameState(): LetterGameState {
  return {
    currentTeam: 'green',
    board: createLetterBoard(BOARD_LETTERS),
    selectedCell: null,
    currentQuestion: null,
    timer: 15,
    expiresAt: null,
    winner: null,
    winningPath: [],
    gameStatus: 'playing',
    history: [],
    round: 1,
  };
}

function finishQuestion(state: LetterGameState, result: HistoryResult): LetterGameState {
  if (!state.selectedCell || !state.currentQuestion || state.gameStatus !== 'question')
    return state;

  const board =
    result === 'correct'
      ? claimCell(state.board, state.selectedCell, state.currentTeam)
      : state.board;
  const winningPath = result === 'correct' ? findWinningPath(board, state.currentTeam) : null;
  const resultLabels: Record<HistoryResult, string> = {
    correct: 'إجابة صحيحة',
    wrong: 'إجابة خاطئة',
    skipped: 'تم التجاوز',
    timeout: 'انتهى الوقت',
  };
  const entry = {
    id: `${state.round}-${state.selectedCell}-${result}`,
    team: state.currentTeam,
    letter: state.currentQuestion.letter,
    result,
    label: resultLabels[result],
  } as const;

  if (winningPath) {
    return {
      ...state,
      board,
      selectedCell: null,
      currentQuestion: null,
      timer: 15,
      expiresAt: null,
      winner: state.currentTeam,
      winningPath,
      gameStatus: 'finished',
      history: [entry, ...state.history],
    };
  }

  return {
    ...state,
    currentTeam: switchTeam(state.currentTeam),
    board,
    selectedCell: null,
    currentQuestion: null,
    timer: 15,
    expiresAt: null,
    gameStatus: 'playing',
    history: [entry, ...state.history],
    round: state.round + 1,
  };
}

export function letterGameReducer(
  state: LetterGameState,
  action: LetterGameAction,
): LetterGameState {
  switch (action.type) {
    case 'select-cell': {
      if (state.gameStatus !== 'playing') return state;
      const cell = getCell(state.board, action.cellId);
      if (!cell || cell.owner) return state;
      return {
        ...state,
        selectedCell: cell.id,
        currentQuestion: action.question ?? getQuestionForLetter(cell.letter),
        timer: 15,
        expiresAt: action.now + 15_000,
        gameStatus: 'question',
      };
    }
    case 'judge':
      if (state.expiresAt !== null && action.now >= state.expiresAt) {
        return finishQuestion(state, 'timeout');
      }
      return finishQuestion(state, action.result);
    case 'tick':
      if (state.gameStatus !== 'question' || state.expiresAt === null) return state;
      if (action.now >= state.expiresAt) return finishQuestion(state, 'timeout');
      return {
        ...state,
        timer: Math.max(1, Math.ceil((state.expiresAt - action.now) / 1000)),
      };
    case 'reset':
      return createInitialLetterGameState();
    default:
      return state;
  }
}
