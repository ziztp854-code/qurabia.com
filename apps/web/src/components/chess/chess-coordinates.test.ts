import { describe, expect, it } from 'vitest';
import {
  boardPositionToSquare,
  getOrientedSquares,
  squareToBoardPosition,
} from './chess-coordinates';

describe('chess 3D coordinates', () => {
  it('maps chess squares to stable world positions', () => {
    expect(squareToBoardPosition('a1')).toEqual([-3.5, 0, 3.5]);
    expect(squareToBoardPosition('e4')).toEqual([0.5, 0, 0.5]);
    expect(squareToBoardPosition('h8')).toEqual([3.5, 0, -3.5]);
  });

  it('maps world board positions back to chess squares', () => {
    expect(boardPositionToSquare(-3.5, 3.5)).toBe('a1');
    expect(boardPositionToSquare(0.5, 0.5)).toBe('e4');
    expect(boardPositionToSquare(3.5, -3.5)).toBe('h8');
  });

  it('changes display order without changing logical squares', () => {
    const white = getOrientedSquares('white');
    const black = getOrientedSquares('black');

    expect(white[0]).toBe('a8');
    expect(white.at(-1)).toBe('h1');
    expect(black[0]).toBe('h1');
    expect(black.at(-1)).toBe('a8');
  });
});
