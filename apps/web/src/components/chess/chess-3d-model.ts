import type { ChessSquare } from './chess-coordinates';

export type ChessPieceColor = 'white' | 'black';
export type ChessPieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';
export type ChessCameraMode = 'player' | 'top' | 'cinematic';
export type ChessSceneQuality = 'low' | 'medium' | 'high';

export type ChessLastMove = Readonly<{
  from: string;
  to: string;
}>;

export type SceneChessPiece = Readonly<{
  color: ChessPieceColor;
  type: ChessPieceType;
  square: ChessSquare;
}>;

export type Chess3DPresentationProps = Readonly<{
  fen: string;
  orientation: ChessPieceColor;
  selected: string | null;
  legal: readonly string[];
  lastMove: ChessLastMove | null;
  check: string | null;
  interactive: boolean;
  onSquarePress: (square: string) => void;
  cameraMode: ChessCameraMode;
  quality: ChessSceneQuality;
  reducedMotion: boolean;
  useClassicBoard?: boolean;
}>;

const PIECE_TYPES: Readonly<Record<string, ChessPieceType>> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const SQUARE_PATTERN = /^[a-h][1-8]$/;

export function isChessSquare(value: string | null): value is ChessSquare {
  return value !== null && SQUARE_PATTERN.test(value);
}

export function parseFenPieces(fen: string): SceneChessPiece[] {
  const placement = fen.trim().split(/\s+/)[0];
  const rows = placement?.split('/');
  if (!rows || rows.length !== 8) return [];

  const pieces: SceneChessPiece[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    let fileIndex = 0;
    for (const token of rows[rowIndex]) {
      if (/^[1-8]$/.test(token)) {
        fileIndex += Number(token);
        continue;
      }

      const type = PIECE_TYPES[token.toLowerCase()];
      if (!type || fileIndex > 7) return [];

      const square = `${String.fromCharCode(97 + fileIndex)}${8 - rowIndex}` as ChessSquare;
      pieces.push({
        color: token === token.toUpperCase() ? 'white' : 'black',
        type,
        square,
      });
      fileIndex += 1;
    }

    if (fileIndex !== 8) return [];
  }

  return pieces;
}

export type MoveTransition = Readonly<{
  from: ChessSquare;
  to: ChessSquare;
  isCapture: boolean;
}>;

export function deriveMoveTransition(
  previousPieces: readonly SceneChessPiece[],
  nextPieces: readonly SceneChessPiece[],
  lastMove: ChessLastMove | null,
): MoveTransition | null {
  if (!lastMove || !isChessSquare(lastMove.from) || !isChessSquare(lastMove.to)) return null;

  const movedPiece = nextPieces.find((piece) => piece.square === lastMove.to);
  const previousMover = previousPieces.find((piece) => piece.square === lastMove.from);
  if (!movedPiece || !previousMover || movedPiece.color !== previousMover.color) return null;

  const targetBeforeMove = previousPieces.find((piece) => piece.square === lastMove.to);
  const isCapture =
    (targetBeforeMove !== undefined && targetBeforeMove.color !== movedPiece.color) ||
    nextPieces.length < previousPieces.length;

  return { from: lastMove.from, to: lastMove.to, isCapture };
}
