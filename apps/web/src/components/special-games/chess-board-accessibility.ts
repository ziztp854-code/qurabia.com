'use client';

import { useState, type KeyboardEvent } from 'react';

const BOARD_COLUMNS = 8;

interface ChessGridNavigationOptions {
  orderedSquares: readonly string[];
  orientation: 'white' | 'black';
  initialSquare?: string | null;
}

interface ChessSquareLabelOptions {
  baseLabel: string;
  selected?: boolean;
  legal?: boolean;
  capture?: boolean;
  lastMove?: boolean;
  check?: boolean;
  checkmate?: boolean;
}

export function getAccessibleChessSquareLabel({
  baseLabel,
  selected = false,
  legal = false,
  capture = false,
  lastMove = false,
  check = false,
  checkmate = false,
}: ChessSquareLabelOptions) {
  const states = [
    selected ? 'محدد' : null,
    legal ? (capture ? 'نقلة قانونية للأخذ' : 'نقلة قانونية') : null,
    lastMove ? 'آخر نقلة' : null,
    checkmate ? 'كش مات' : check ? 'كش' : null,
  ].filter(Boolean);

  return [baseLabel, ...states].join('، ');
}

export function useChessGridNavigation({
  orderedSquares,
  orientation,
  initialSquare,
}: ChessGridNavigationOptions) {
  const firstSquare =
    initialSquare && orderedSquares.includes(initialSquare)
      ? initialSquare
      : (orderedSquares[0] ?? '');
  const [focusState, setFocusState] = useState(() => ({
    orientation,
    square: firstSquare,
  }));
  const activeSquare =
    focusState.orientation === orientation && orderedSquares.includes(focusState.square)
      ? focusState.square
      : firstSquare;

  const handleSquareKeyDown = (event: KeyboardEvent<HTMLButtonElement>, square: string) => {
    const currentIndex = orderedSquares.indexOf(square);
    if (currentIndex < 0) return;

    const row = Math.floor(currentIndex / BOARD_COLUMNS);
    const column = currentIndex % BOARD_COLUMNS;
    let nextIndex = currentIndex;

    switch (event.key) {
      case 'ArrowRight':
        if (column < BOARD_COLUMNS - 1) nextIndex += 1;
        break;
      case 'ArrowLeft':
        if (column > 0) nextIndex -= 1;
        break;
      case 'ArrowDown':
        if (row < BOARD_COLUMNS - 1) nextIndex += BOARD_COLUMNS;
        break;
      case 'ArrowUp':
        if (row > 0) nextIndex -= BOARD_COLUMNS;
        break;
      case 'Home':
        nextIndex = event.ctrlKey ? 0 : row * BOARD_COLUMNS;
        break;
      case 'End':
        nextIndex = event.ctrlKey
          ? orderedSquares.length - 1
          : row * BOARD_COLUMNS + BOARD_COLUMNS - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextSquare = orderedSquares[nextIndex];
    if (!nextSquare || nextSquare === square) return;

    setFocusState({ orientation, square: nextSquare });
    event.currentTarget
      .closest('[role="grid"]')
      ?.querySelector<HTMLButtonElement>(`[data-square="${nextSquare}"]`)
      ?.focus();
  };

  return {
    getSquareTabIndex: (square: string) => (square === activeSquare ? 0 : -1),
    handleSquareFocus: (square: string) => setFocusState({ orientation, square }),
    handleSquareKeyDown,
  };
}
