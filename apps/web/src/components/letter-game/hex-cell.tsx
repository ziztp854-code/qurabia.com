import type { CSSProperties, KeyboardEvent } from 'react';
import type { BoardCell } from '@/lib/letter-game/types';
import { formatNumber } from '@/lib/utils';
import styles from './letter-game.module.css';

export function HexCell({
  cell,
  selected,
  winning,
  lastClaimed,
  selectable,
  tabIndex,
  winningIndex,
  onSelect,
  onKeyDown,
}: {
  cell: BoardCell;
  selected: boolean;
  winning: boolean;
  lastClaimed: boolean;
  selectable: boolean;
  tabIndex: number;
  winningIndex: number;
  onSelect: (cellId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const ownerLabel =
    cell.owner === 'green'
      ? 'يملكها الفريق الأخضر'
      : cell.owner === 'orange'
        ? 'يملكها الفريق البرتقالي'
        : selectable
          ? 'خلية متاحة'
          : 'انتظر حكم السؤال الحالي';

  return (
    <button
      className={styles.hexCell}
      data-owner={cell.owner ?? 'none'}
      data-selected={selected || undefined}
      data-winning={winning || undefined}
      data-claimed={lastClaimed || undefined}
      data-letter-cell={cell.id}
      disabled={!selectable}
      tabIndex={tabIndex}
      onClick={() => onSelect(cell.id)}
      onKeyDown={onKeyDown}
      aria-label={`الحرف ${cell.letter}، ${ownerLabel}، الصف ${formatNumber(cell.row + 1)}، العمود ${formatNumber(cell.column + 1)}`}
      style={{ '--winning-order': winningIndex } as CSSProperties}
    >
      <span className={styles.cellLetter}>{cell.letter}</span>
      {cell.owner ? (
        <span className={styles.cellOwnerMark} aria-hidden="true">
          {cell.owner === 'green' ? '↓' : '←'}
        </span>
      ) : null}
    </button>
  );
}
