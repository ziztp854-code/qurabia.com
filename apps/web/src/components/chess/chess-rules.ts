import { Chess, type Move, type Square } from 'chess.js';

export type PresentationMove = Pick<Move, 'from' | 'to' | 'san' | 'flags' | 'piece' | 'color'> & {
  captured?: string;
  promotion?: string;
};

export function getLegalMoves(fen: string, fromSquare: string): PresentationMove[] {
  try {
    const engine = new Chess(fen);
    return engine.moves({ square: fromSquare as Square, verbose: true }).map((move) => ({
      from: move.from,
      to: move.to,
      san: move.san,
      flags: move.flags,
      piece: move.piece,
      color: move.color,
      captured: move.captured,
      promotion: move.promotion,
    }));
  } catch {
    return [];
  }
}

export function getPositionStatus(fen: string) {
  try {
    const engine = new Chess(fen);
    const activeColor = engine.turn();
    const kingSquare = engine
      .board()
      .flat()
      .find((piece) => piece?.type === 'k' && piece.color === activeColor)?.square;

    return {
      inCheck: engine.inCheck(),
      checkmate: engine.isCheckmate(),
      stalemate: engine.isStalemate(),
      draw: engine.isDraw(),
      kingSquare: kingSquare ?? null,
    };
  } catch {
    return {
      inCheck: false,
      checkmate: false,
      stalemate: false,
      draw: false,
      kingSquare: null,
    };
  }
}
