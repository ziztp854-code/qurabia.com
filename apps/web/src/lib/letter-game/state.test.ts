import { describe, expect, it } from 'vitest';
import { createInitialLetterGameState, letterGameReducer } from './state';
import { LETTER_QUESTION_POOL } from './questions';

describe('letter challenge state', () => {
  const alternative = LETTER_QUESTION_POOL.find((question) => question.id === 'alternative-أ')!;
  function selectAlif() {
    return letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
    });
  }

  it('replaces a question without changing the cell, team, board, or score history', () => {
    const selected = selectAlif();
    const changed = letterGameReducer(selected, {
      type: 'replace-question',
      question: alternative,
    });
    expect(changed.currentQuestion).toBe(alternative);
    expect(changed.selectedCell).toBe(selected.selectedCell);
    expect(changed.currentTeam).toBe(selected.currentTeam);
    expect(changed.board).toBe(selected.board);
    expect(changed.history).toEqual([]);
    expect(changed.round).toBe(1);
    expect(changed.usedQuestionIds).toEqual([selected.currentQuestion!.id, alternative.id]);
  });

  it('rejects replacement with the same question or another letter and outside a question', () => {
    const selected = selectAlif();
    for (const question of [selected.currentQuestion!, { ...alternative, letter: 'ب' }]) {
      expect(letterGameReducer(selected, { type: 'replace-question', question })).toBe(selected);
    }
    const initial = createInitialLetterGameState();
    expect(letterGameReducer(initial, { type: 'replace-question', question: alternative })).toBe(
      initial,
    );
  });

  it('opens the matching question for an available cell', () => {
    const state = createInitialLetterGameState();
    const next = letterGameReducer(state, { type: 'select-cell', cellId: '0:0' });

    expect(next.gameStatus).toBe('question');
    expect(next.selectedCell).toBe('0:0');
    expect(next.currentQuestion?.letter).toBe('أ');
  });

  it('awards a correct answer, records it, and hands over the turn', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
    });
    const next = letterGameReducer(selected, { type: 'judge', result: 'correct' });

    expect(next.board.cells.find((cell) => cell.id === '0:0')?.owner).toBe('green');
    expect(next.currentTeam).toBe('orange');
    expect(next.history[0]?.result).toBe('correct');
    expect(next.gameStatus).toBe('playing');
  });

  it('does not award a wrong or skipped answer', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:1',
    });
    const next = letterGameReducer(selected, { type: 'judge', result: 'wrong' });

    expect(next.board.cells.find((cell) => cell.id === '0:1')?.owner).toBeNull();
    expect(next.currentTeam).toBe('orange');
    expect(next.history[0]?.result).toBe('wrong');
  });

  it('ignores attempts to select an owned cell', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
    });
    const awarded = letterGameReducer(selected, { type: 'judge', result: 'correct' });
    const ignored = letterGameReducer(awarded, {
      type: 'select-cell',
      cellId: '0:0',
    });

    expect(ignored).toBe(awarded);
  });
});
