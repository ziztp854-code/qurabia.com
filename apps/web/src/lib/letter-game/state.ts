import { claimCell, createLetterBoard, findWinningPath, getCell, switchTeam } from './engine';
import { BOARD_LETTERS, getQuestionForLetter } from './questions';
import type { HistoryResult, LetterGameState, LetterQuestion } from './types';

export type LetterGameAction =
  | { type: 'select-cell'; cellId: string; question?: LetterQuestion }
  | { type: 'replace-question'; question: LetterQuestion }
  | { type: 'judge'; result: HistoryResult }
  | { type: 'reset' };

export function createInitialLetterGameState(): LetterGameState {
  return {
    currentTeam: 'green',
    board: createLetterBoard(BOARD_LETTERS),
    selectedCell: null,
    currentQuestion: null,
    usedQuestionIds: [],
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
      const question = action.question ?? getQuestionForLetter(cell.letter);
      if (question.letter !== cell.letter) return state;
      return {
        ...state,
        selectedCell: cell.id,
        currentQuestion: question,
        usedQuestionIds: [...state.usedQuestionIds, question.id],
        gameStatus: 'question',
      };
    }
    case 'replace-question': {
      if (state.gameStatus !== 'question' || !state.currentQuestion) return state;
      if (
        action.question.letter !== state.currentQuestion.letter ||
        action.question.id === state.currentQuestion.id ||
        action.question.prompt === state.currentQuestion.prompt
      )
        return state;
      return {
        ...state,
        currentQuestion: action.question,
        usedQuestionIds: [...state.usedQuestionIds, action.question.id],
      };
    }
    case 'judge':
      return finishQuestion(state, action.result);
    case 'reset':
      return createInitialLetterGameState();
    default:
      return state;
  }
}
