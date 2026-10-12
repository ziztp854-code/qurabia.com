import { describe, expect, it } from 'vitest';
import { createInitialLetterGameState, letterGameReducer } from './state';
import { LETTER_QUESTION_POOL } from './questions';

describe('letter challenge state', () => {
  const alternative = LETTER_QUESTION_POOL.find((question) => question.id === 'alternative-أ')!;
  function selectAlif() {
    return letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
      now: 1_000,
    });
  }

  it('replaces a question without changing the cell, team, board, or score history', () => {
    const selected = selectAlif();
    const changed = letterGameReducer(selected, {
      type: 'replace-question',
      question: alternative,
      now: 5_000,
    });
    expect(changed.currentQuestion).toBe(alternative);
    expect(changed.selectedCell).toBe(selected.selectedCell);
    expect(changed.currentTeam).toBe(selected.currentTeam);
    expect(changed.board).toBe(selected.board);
    expect(changed.history).toEqual([]);
    expect(changed.round).toBe(1);
    expect(changed.timer).toBe(15);
    expect(changed.expiresAt).toBe(20_000);
    expect(changed.usedQuestionIds).toEqual([selected.currentQuestion!.id, alternative.id]);
  });

  it('rejects replacement with the same question or another letter and outside a question', () => {
    const selected = selectAlif();
    for (const question of [selected.currentQuestion!, { ...alternative, letter: 'ب' }]) {
      expect(letterGameReducer(selected, { type: 'replace-question', question, now: 5_000 })).toBe(
        selected,
      );
    }
    const initial = createInitialLetterGameState();
    expect(
      letterGameReducer(initial, { type: 'replace-question', question: alternative, now: 5_000 }),
    ).toBe(initial);
  });

  it('treats an expired replacement request as a timeout before the next tick', () => {
    const changed = letterGameReducer(selectAlif(), {
      type: 'replace-question',
      question: alternative,
      now: 16_000,
    });
    expect(changed.gameStatus).toBe('playing');
    expect(changed.history[0]?.result).toBe('timeout');
    expect(changed.currentTeam).toBe('orange');
    expect(changed.board.cells[0]?.owner).toBeNull();
  });
  it('opens the matching question for an available cell', () => {
    const state = createInitialLetterGameState();
    const next = letterGameReducer(state, { type: 'select-cell', cellId: '0:0', now: 1_000 });

    expect(next.gameStatus).toBe('question');
    expect(next.selectedCell).toBe('0:0');
    expect(next.currentQuestion?.letter).toBe('أ');
    expect(next.timer).toBe(15);
  });

  it('awards a correct answer, records it, and hands over the turn', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
      now: 1_000,
    });
    const next = letterGameReducer(selected, { type: 'judge', result: 'correct', now: 2_000 });

    expect(next.board.cells.find((cell) => cell.id === '0:0')?.owner).toBe('green');
    expect(next.currentTeam).toBe('orange');
    expect(next.history[0]?.result).toBe('correct');
    expect(next.gameStatus).toBe('playing');
  });

  it('does not award a wrong or skipped answer', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:1',
      now: 1_000,
    });
    const next = letterGameReducer(selected, { type: 'judge', result: 'wrong', now: 2_000 });

    expect(next.board.cells.find((cell) => cell.id === '0:1')?.owner).toBeNull();
    expect(next.currentTeam).toBe('orange');
    expect(next.history[0]?.result).toBe('wrong');
  });

  it('treats an expired timer as a timeout and changes the team', () => {
    let state = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:2',
      now: 1_000,
    });
    state = letterGameReducer(state, { type: 'tick', now: 16_000 });

    expect(state.gameStatus).toBe('playing');
    expect(state.currentTeam).toBe('orange');
    expect(state.history[0]?.result).toBe('timeout');
  });

  it('rejects a late judgment even before the next timer tick', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
      now: 1_000,
    });
    const next = letterGameReducer(selected, {
      type: 'judge',
      result: 'correct',
      now: 16_000,
    });

    expect(next.board.cells.find((cell) => cell.id === '0:0')?.owner).toBeNull();
    expect(next.history[0]?.result).toBe('timeout');
    expect(next.currentTeam).toBe('orange');
  });

  it('ignores attempts to select an owned cell', () => {
    const selected = letterGameReducer(createInitialLetterGameState(), {
      type: 'select-cell',
      cellId: '0:0',
      now: 1_000,
    });
    const awarded = letterGameReducer(selected, { type: 'judge', result: 'correct', now: 2_000 });
    const ignored = letterGameReducer(awarded, {
      type: 'select-cell',
      cellId: '0:0',
      now: 2_000,
    });

    expect(ignored).toBe(awarded);
  });
});
