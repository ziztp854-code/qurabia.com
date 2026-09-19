import { Chess } from 'chess.js';

export function createChessEngine(fen = STARTING_FEN) {
  const engine = new Chess();
  engine.load(fen);
  return engine;
}

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function validateChessMove(
  engine: Chess,
  from: string,
  to: string,
  promotion?: string,
): { ok: true; san: string } | { ok: false; code: string; message: string } {
  try {
    const move = engine.move({ from, to, promotion });
    if (!move) {
      if (engine.isCheckmate()) {
        return { ok: false, code: 'CHECKMATE', message: 'كش مات' };
      }
      if (engine.isStalemate()) {
        return { ok: false, code: 'STALEMATE', message: 'تعادل - بات' };
      }
      if (engine.isDraw()) {
        if (engine.isThreefoldRepetition()) {
          return {
            ok: false,
            code: 'DRAW_REPETITION',
            message: 'تعادل - تكرار ثلاثي',
          };
        }
        if (engine.isInsufficientMaterial()) {
          return {
            ok: false,
            code: 'DRAW_INSUFFICIENT_MATERIAL',
            message: 'تعادل - مادة غير كافية',
          };
        }
        return { ok: false, code: 'DRAW', message: 'تعادل' };
      }
      if (engine.isCheck()) {
        return {
          ok: false,
          code: 'ILLEGAL_IN_CHECK',
          message: 'نقلة غير قانونية والملك في كش',
        };
      }
      return { ok: false, code: 'ILLEGAL_MOVE', message: 'نقلة غير قانونية' };
    }
    return { ok: true, san: move.san };
  } catch {
    return { ok: false, code: 'ILLEGAL_MOVE', message: 'نقلة غير قانونية' };
  }
}

export function detectDraw(engine: Chess): {
  isDraw: boolean;
  reason?: string;
} {
  if (engine.isCheckmate()) {
    return { isDraw: false };
  }
  if (engine.isStalemate()) {
    return { isDraw: true, reason: 'stalemate' };
  }
  if (engine.isThreefoldRepetition()) {
    return { isDraw: true, reason: 'draw_repetition' };
  }
  if (engine.isInsufficientMaterial()) {
    return { isDraw: true, reason: 'draw_insufficient_material' };
  }
  if (engine.isDrawByFiftyMoves()) {
    return { isDraw: true, reason: 'draw_fifty_move' };
  }
  return { isDraw: false };
}
