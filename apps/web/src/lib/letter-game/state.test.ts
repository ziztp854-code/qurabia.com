import { describe, expect, it } from 'vitest';
import { createInitialLetterGameState, letterGameReducer } from './state';

describe('letter challenge state', () => {
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
