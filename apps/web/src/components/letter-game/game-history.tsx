import { useEffect, useRef, type KeyboardEvent } from 'react';
import { History, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { GameHistoryEntry } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

function HistoryList({ history }: { history: readonly GameHistoryEntry[] }) {
  if (history.length === 0) return <p className={styles.historyEmpty}>لم تبدأ المحاولات بعد.</p>;
  return (
    <ol className={styles.historyList}>
      {history.slice(0, 8).map((entry, index) => (
        <li key={entry.id} data-team={entry.team} data-result={entry.result}>
          <span>{entry.letter}</span>
          <div>
            <strong>{entry.label}</strong>
            <small>المحاولة {formatNumber(history.length - index)}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function GameHistory({
  history,
  open,
  onOpen,
  onClose,
}: {
  history: readonly GameHistoryEntry[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  function handleSheetKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      closeRef.current?.focus();
    }
  }

  return (
    <>
      <section className={styles.historyDesktop} aria-labelledby="history-title">
        <div className={styles.historyHeading}>
          <History aria-hidden="true" />
          <h2 id="history-title">سجل اللعب</h2>
        </div>
        <HistoryList history={history} />
      </section>
      <button ref={triggerRef} className={styles.historyTrigger} type="button" onClick={onOpen}>
        <History aria-hidden="true" />
        <span>فتح سجل اللعب</span>
      </button>
      {open ? (
        <div className={styles.sheetBackdrop} role="presentation" onClick={onClose}>
          <section
            className={styles.historySheet}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-sheet-title"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleSheetKeyDown}
          >
            <div className={styles.historyHeading}>
              <History aria-hidden="true" />
              <h2 id="history-sheet-title">سجل اللعب</h2>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="إغلاق سجل اللعب">
                <X aria-hidden="true" />
              </button>
            </div>
            <HistoryList history={history} />
          </section>
        </div>
      ) : null}
    </>
  );
}
