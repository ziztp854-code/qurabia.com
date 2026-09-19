import { describe, expect, it } from 'vitest';
import { getLegalMoves, getPositionStatus } from './chess-rules';

describe('client chess presentation rules', () => {
  it('returns only legal moves for a selected piece', () => {
    const moves = getLegalMoves('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2');

    expect(moves.map((move) => move.to).sort()).toEqual(['e3', 'e4']);
  });

  it('does not expose moves that leave the king in check', () => {
    const moves = getLegalMoves('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1', 'e2');

    expect(moves.map((move) => move.to)).not.toContain('d2');
  });

  it('includes castling and en passant when chess.js allows them', () => {
    const castleMoves = getLegalMoves('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1');
    expect(castleMoves.map((move) => move.to)).toEqual(expect.arrayContaining(['c1', 'g1']));

    const enPassantMoves = getLegalMoves('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'e5');
    expect(enPassantMoves).toContainEqual(expect.objectContaining({ to: 'd6', captured: 'p' }));
  });

  it('marks promotion choices and checkmate state', () => {
    const promotionMoves = getLegalMoves('4k3/6P1/8/8/8/8/8/4K3 w - - 0 1', 'g7');
    expect(promotionMoves.filter((move) => move.to === 'g8').map((move) => move.promotion)).toEqual(
      expect.arrayContaining(['q', 'r', 'b', 'n']),
    );

    expect(getPositionStatus('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1')).toEqual(
      expect.objectContaining({ inCheck: true, checkmate: true, kingSquare: 'h8' }),
    );
  });
});
