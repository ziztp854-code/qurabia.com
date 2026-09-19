import { describe, expect, it } from 'vitest';
import {
  claimCell,
  createLetterBoard,
  findWinningPath,
  getHexNeighborIds,
  isWinningPath,
  switchTeam,
} from './engine';
import type { GameBoard, TeamId } from './types';

const LETTERS = ['أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ'];

function claimMany(board: GameBoard, team: TeamId, ids: string[]) {
  return ids.reduce((nextBoard, id) => claimCell(nextBoard, id, team), board);
}

describe('letter challenge engine', () => {
  it('creates a stable rectangular board without mutating the letters', () => {
    const source = [...LETTERS];
    const board = createLetterBoard(source, 3, 3);

    expect(board.cells).toHaveLength(9);
    expect(board.cells[0]).toMatchObject({ id: '0:0', row: 0, column: 0, letter: 'أ' });
    expect(board.cells[8]).toMatchObject({ id: '2:2', row: 2, column: 2, letter: 'ذ' });
    expect(source).toEqual(LETTERS);
  });

  it('rejects non-integer or non-finite board dimensions', () => {
    expect(() => createLetterBoard(LETTERS, 2.5, 2)).toThrow();
    expect(() => createLetterBoard(LETTERS, Number.NaN, 2)).toThrow();
    expect(() => createLetterBoard(LETTERS, 2, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('returns six-direction hex neighbours for an interior cell', () => {
    const board = createLetterBoard(LETTERS, 3, 3);
    expect(getHexNeighborIds(board, '1:1').sort()).toEqual(
      ['0:1', '0:2', '1:0', '1:2', '2:1', '2:2'].sort(),
    );
  });

  it('finds an orange path from the right edge to the left edge', () => {
    const board = claimMany(createLetterBoard(LETTERS, 3, 3), 'orange', ['0:2', '0:1', '1:0']);

    const path = findWinningPath(board, 'orange');
    expect(path).not.toBeNull();
    expect(path?.[0]).toBe('0:2');
    expect(path?.at(-1)).toBe('1:0');
    expect(isWinningPath(board, 'orange', path ?? [])).toBe(true);
  });

  it('finds a green path from the top edge to the bottom edge', () => {
    const board = claimMany(createLetterBoard(LETTERS, 3, 3), 'green', ['0:1', '1:1', '2:1']);

    const path = findWinningPath(board, 'green');
    expect(path).not.toBeNull();
    expect(path?.[0]).toBe('0:1');
    expect(path?.at(-1)).toBe('2:1');
  });

  it('does not accept disconnected cells or cells owned by the other team', () => {
    let board = claimMany(createLetterBoard(LETTERS, 3, 3), 'orange', ['0:2', '0:1']);
    board = claimCell(board, '1:0', 'green');

    expect(findWinningPath(board, 'orange')).toBeNull();
    expect(isWinningPath(board, 'orange', ['0:2', '0:1', '1:0'])).toBe(false);
  });

  it('claims cells immutably and refuses to overwrite an owned cell', () => {
    const board = createLetterBoard(LETTERS, 3, 3);
    const claimed = claimCell(board, '1:1', 'green');

    expect(board.cells.find((cell) => cell.id === '1:1')?.owner).toBeNull();
    expect(claimed.cells.find((cell) => cell.id === '1:1')?.owner).toBe('green');
    expect(() => claimCell(claimed, '1:1', 'orange')).toThrow(/مملوكة/);
  });

  it('switches between the two teams', () => {
    expect(switchTeam('green')).toBe('orange');
    expect(switchTeam('orange')).toBe('green');
  });
});
