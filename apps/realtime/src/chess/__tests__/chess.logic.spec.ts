import {
  createChessEngine,
  detectDraw,
  validateChessMove,
  STARTING_FEN,
} from '../chess.logic.js';

describe('chess.logic', () => {
  it('creates engine from starting FEN', () => {
    const engine = createChessEngine(STARTING_FEN);
    expect(engine.fen()).toContain('w KQkq');
  });

  it('validates legal e2-e4', () => {
    const engine = createChessEngine(STARTING_FEN);
    const result = validateChessMove(engine, 'e2', 'e4');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.san).toBe('e4');
  });

  it('rejects wrong turn', () => {
    const engine = createChessEngine(STARTING_FEN);
    const result = validateChessMove(engine, 'e7', 'e5');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ILLEGAL_MOVE');
  });

  it('rejects illegal move', () => {
    const engine = createChessEngine(STARTING_FEN);
    const result = validateChessMove(engine, 'e2', 'e5');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ILLEGAL_MOVE');
  });

  it('supports promotion', () => {
    const engine = createChessEngine('8/7P/8/8/8/8/8/4k2K w - - 0 1');
    const result = validateChessMove(engine, 'h7', 'h8', 'q');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.san).toBe('h8=Q');
  });

  it("detects checkmate in scholar's mate position", () => {
    const engine = createChessEngine(
      'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1',
    );
    const result = validateChessMove(engine, 'e5', 'e4');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ILLEGAL_MOVE');
  });

  it('detects draw by fifty-move rule', () => {
    const engine = createChessEngine(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 100 1',
    );
    const draw = detectDraw(engine);
    expect(draw.isDraw).toBe(true);
    expect(draw.reason).toBe('draw_fifty_move');
  });

  it('keeps a normal opening position in play', () => {
    const engine = createChessEngine(STARTING_FEN);
    const result = validateChessMove(engine, 'e2', 'e4');

    expect(result.ok).toBe(true);
    expect(detectDraw(engine)).toEqual({ isDraw: false });
  });
});
