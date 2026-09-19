'use client';

import { useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft } from 'lucide-react';
import type { BoardCell, GameBoard } from '@/lib/letter-game/types';
import { HexCell } from './hex-cell';
import styles from './letter-game.module.css';

export function HexBoard({
  board,
  selectedCell,
  winningPath,
  lastClaimed,
  canSelect,
  onSelect,
}: {
  board: GameBoard;
  selectedCell: string | null;
  winningPath: readonly string[];
  lastClaimed: string | null;
  canSelect: boolean;
  onSelect: (cellId: string) => void;
}) {
  const firstAvailable = board.cells.find((cell) => !cell.owner)?.id ?? null;
  const [rovingCell, setRovingCell] = useState<string | null>(firstAvailable);
  const rovingCellAvailable = board.cells.some((cell) => cell.id === rovingCell && !cell.owner);
  const activeRovingCell = rovingCellAvailable ? rovingCell : firstAvailable;

  function handleCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, cell: BoardCell) {
    const movement = {
      ArrowRight: [0, -1],
      ArrowLeft: [0, 1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    }[event.key];
    if (!movement) return;

    event.preventDefault();
    const [rowStep, columnStep] = movement;
    let row = cell.row + rowStep;
    let column = cell.column + columnStep;
    while (row >= 0 && row < board.rows && column >= 0 && column < board.columns) {
      const target = board.cells.find(
        (candidate) => candidate.row === row && candidate.column === column,
      );
      if (target && !target.owner) {
        setRovingCell(target.id);
        document
          .querySelector<HTMLButtonElement>(`button[data-letter-cell="${target.id}"]`)
          ?.focus();
        return;
      }
      row += rowStep;
      column += columnStep;
    }
  }

  return (
    <section className={styles.boardStage} aria-labelledby="letter-board-title">
      <h2 id="letter-board-title" className="sr-only">
        لوحة تحدي الحروف
      </h2>
      <div className={styles.boardGoalMap} aria-label="اتجاهات الفوز">
        <span data-team="green">
          <ArrowDown aria-hidden="true" />
          الأخضر: أعلى إلى أسفل
        </span>
        <span data-team="orange">
          <ArrowLeft aria-hidden="true" />
          البرتقالي: يمين إلى يسار
        </span>
      </div>
      <div className={styles.boardShell}>
        <span className={styles.boardCircuit} aria-hidden="true" />
        <span className={styles.greenGate} aria-hidden="true" />
        <span className={styles.orangeGate} aria-hidden="true" />
        <div className={styles.hexBoard} role="group" aria-label="شبكة حروف تحدي الحروف">
          {Array.from({ length: board.rows }, (_, row) => (
            <div className={styles.hexRow} key={row} data-row={row}>
              {board.cells
                .filter((cell) => cell.row === row)
                .map((cell) => {
                  const winningIndex = winningPath.indexOf(cell.id);
                  return (
                    <HexCell
                      key={cell.id}
                      cell={cell}
                      selected={selectedCell === cell.id}
                      winning={winningIndex >= 0}
                      winningIndex={winningIndex}
                      lastClaimed={lastClaimed === cell.id}
                      selectable={canSelect && !cell.owner}
                      tabIndex={canSelect && activeRovingCell === cell.id ? 0 : -1}
                      onSelect={onSelect}
                      onKeyDown={(event) => handleCellKeyDown(event, cell)}
                    />
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
