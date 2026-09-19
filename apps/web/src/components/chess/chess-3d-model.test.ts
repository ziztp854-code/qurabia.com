import { describe, expect, it } from 'vitest';
import { deriveMoveTransition, parseFenPieces } from './chess-3d-model';

describe('chess 3D presentation model', () => {
  it('parses FEN placement into scene pieces without depending on WebGL', () => {
    const pieces = parseFenPieces('8/3k4/8/8/4P3/8/8/4K3 b - - 0 1');

    expect(pieces).toEqual([
      { color: 'black', type: 'king', square: 'd7' },
      { color: 'white', type: 'pawn', square: 'e4' },
      { color: 'white', type: 'king', square: 'e1' },
    ]);
  });

  it('rejects malformed FEN placement safely', () => {
    expect(parseFenPieces('8/8/8')).toEqual([]);
    expect(parseFenPieces('8/8/8/8/8/8/8/9 w - - 0 1')).toEqual([]);
  });

  it('derives accepted movement and normal capture pulses from snapshots', () => {
    const previous = parseFenPieces('8/8/8/3p4/4P3/8/8/4K2k w - - 0 1');
    const next = parseFenPieces('8/8/8/3P4/8/8/8/4K2k b - - 0 1');

    expect(deriveMoveTransition(previous, next, { from: 'e4', to: 'd5' })).toEqual({
      from: 'e4',
      to: 'd5',
      isCapture: true,
    });
  });

  it('detects en passant captures from the piece-count delta', () => {
    const previous = parseFenPieces('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
    const next = parseFenPieces('4k3/8/3P4/8/8/8/8/4K3 b - - 0 2');

    expect(deriveMoveTransition(previous, next, { from: 'e5', to: 'd6' })).toEqual({
      from: 'e5',
      to: 'd6',
      isCapture: true,
    });
  });
});
