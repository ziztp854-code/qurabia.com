import { useEffect, useRef, type KeyboardEvent } from 'react';
import { RotateCcw, Route } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { TeamId } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

export function VictoryOverlay({
  winner,
  pathLength,
  onReset,
}: {
  winner: TeamId | null;
  pathLength: number;
  onReset: () => void;
}) {
  const resetRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (winner) resetRef.current?.focus();
  }, [winner]);

  if (!winner) return null;
  const name = winner === 'green' ? 'الفريق الأخضر' : 'الفريق البرتقالي';

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Tab') {
      event.preventDefault();
      resetRef.current?.focus();
    }
  }

  return (
    <div className={styles.victoryBackdrop}>
      <section
        className={styles.victoryOverlay}
        data-team={winner}
        role="dialog"
        aria-modal="true"
        aria-labelledby="letter-victory-title"
        aria-describedby="letter-victory-description"
        onKeyDown={handleDialogKeyDown}
      >
        <span className={styles.victoryPulse} aria-hidden="true" />
        <Route aria-hidden="true" />
        <span>اكتمل المسار</span>
        <h2 id="letter-victory-title">فاز {name}</h2>
        <p id="letter-victory-description">
          ربط {formatNumber(pathLength)} خلايا ووصل إلى الجهة المقابلة.
        </p>
        <button ref={resetRef} type="button" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          جولة جديدة
        </button>
      </section>
    </div>
  );
}
