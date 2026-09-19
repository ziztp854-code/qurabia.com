import { ArrowDown, ArrowLeft } from 'lucide-react';
import type { TeamId } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

export function TurnIndicator({ team }: { team: TeamId }) {
  const green = team === 'green';
  return (
    <div
      id="letter-turn-indicator"
      className={styles.turnIndicator}
      data-team={team}
      aria-live="polite"
      tabIndex={-1}
    >
      <span className={styles.turnDot} aria-hidden="true" />
      <strong>دور الفريق {green ? 'الأخضر' : 'البرتقالي'}</strong>
      <span className={styles.turnGoal}>
        {green ? 'أعلى إلى أسفل' : 'يمين إلى يسار'}
        {green ? <ArrowDown aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
      </span>
    </div>
  );
}
