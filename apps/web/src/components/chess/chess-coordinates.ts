export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export type ChessSquare = `${(typeof FILES)[number]}${(typeof RANKS)[number]}`;
export type BoardOrientation = 'white' | 'black';

export function squareToBoardPosition(square: string): [number, number, number] {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  if (file < 0 || !Number.isInteger(rank) || rank < 1 || rank > 8) {
    throw new Error(`Invalid chess square: ${square}`);
  }

  return [file - 3.5, 0, 4.5 - rank];
}

export function boardPositionToSquare(x: number, z: number): ChessSquare {
  const fileIndex = Math.round(x + 3.5);
  const rank = Math.round(4.5 - z);
  if (fileIndex < 0 || fileIndex > 7 || rank < 1 || rank > 8) {
    throw new Error(`Position is outside the chess board: ${x}, ${z}`);
  }

  return `${FILES[fileIndex]}${rank}` as ChessSquare;
}

export function getOrientedSquares(orientation: BoardOrientation): ChessSquare[] {
  const squares = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}` as ChessSquare));
  return orientation === 'black' ? [...squares].reverse() : squares;
}
