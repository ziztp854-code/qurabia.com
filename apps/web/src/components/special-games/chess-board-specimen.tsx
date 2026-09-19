'use client';

import { useMemo } from 'react';
import { getAccessibleChessSquareLabel, useChessGridNavigation } from './chess-board-accessibility';
import { ChessBoardFrame } from './chess-board-frame';
import { ChessPieceSvg, getPieceLabel } from './chess-piece';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const STARTING_ROWS: (string | null)[][] = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

function isDarkSquare(row: number, col: number) {
  return (row + col) % 2 === 1;
}

export function ChessBoardSpecimen({
  selectedSquare,
  legalSquares = [],
  flipped = false,
  onSquareActivate,
}: {
  selectedSquare?: string;
  legalSquares?: string[];
  flipped?: boolean;
  onSquareActivate?: (square: string) => void;
}) {
  const displayRows = useMemo(
    () => (flipped ? [...STARTING_ROWS].reverse().map((row) => [...row].reverse()) : STARTING_ROWS),
    [flipped],
  );
  const orderedSquares = useMemo(
    () =>
      displayRows.flatMap((row) =>
        row.map((_, colIdx) => {
          const rowIdx = displayRows.indexOf(row);
          const actualRow = flipped ? 7 - rowIdx : rowIdx;
          const actualCol = flipped ? 7 - colIdx : colIdx;
          return `${FILES[actualCol]}${8 - actualRow}`;
        }),
      ),
    [displayRows, flipped],
  );
  const { getSquareTabIndex, handleSquareFocus, handleSquareKeyDown } = useChessGridNavigation({
    orderedSquares,
    orientation: flipped ? 'black' : 'white',
    initialSquare: selectedSquare,
  });

  return (
    <div className="chess-board-specimen" data-game="chess">
      <ChessBoardFrame flipped={flipped}>
        <div
          className="chess-board chess-board--classic"
          role="grid"
          aria-label="رقعة الشطرنج الكلاسيكية"
          aria-rowcount={8}
          aria-colcount={8}
          dir="ltr"
        >
          {displayRows.map((row, rowIdx) => (
            <div key={rowIdx} className="chess-board__row" role="row" aria-rowindex={rowIdx + 1}>
              {row.map((piece, colIdx) => {
                const actualRow = flipped ? 7 - rowIdx : rowIdx;
                const actualCol = flipped ? 7 - colIdx : colIdx;
                const square = `${FILES[actualCol]}${8 - actualRow}`;
                const hasPiece = piece !== null;
                const pieceColor = hasPiece && piece === piece.toUpperCase() ? 'white' : 'black';
                const isSelected = selectedSquare === square;
                const isLegal = legalSquares.includes(square);
                const squareLabel = getAccessibleChessSquareLabel({
                  baseLabel: hasPiece ? `${getPieceLabel(piece)} في ${square}` : `مربع ${square}`,
                  selected: isSelected,
                  legal: isLegal,
                  capture: isLegal && hasPiece,
                });
                return (
                  <div
                    key={square}
                    className="chess-gridcell"
                    role="gridcell"
                    aria-label={squareLabel}
                    aria-selected={isSelected}
                    aria-colindex={colIdx + 1}
                  >
                    <button
                      type="button"
                      className={[
                        'chess-square',
                        isDarkSquare(actualRow, actualCol) ? 'dark' : 'light',
                        isSelected ? 'selected' : '',
                        isLegal ? 'legal' : '',
                        hasPiece ? 'occupied' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={squareLabel}
                      tabIndex={getSquareTabIndex(square)}
                      onFocus={() => handleSquareFocus(square)}
                      onKeyDown={(event) => handleSquareKeyDown(event, square)}
                      onClick={() => onSquareActivate?.(square)}
                      data-square={square}
                    >
                      {hasPiece && (
                        <ChessPieceSvg piece={piece} color={pieceColor} decorative />
                      )}
                      {isLegal && !hasPiece && <span className="chess-legal-dot" />}
                      {isLegal && hasPiece && <span className="chess-legal-ring" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ChessBoardFrame>
    </div>
  );
}
