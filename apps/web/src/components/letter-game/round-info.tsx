import { Grid3X3, RotateCcw } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import styles from './letter-game.module.css';

export function RoundInfo({
  round,
  available,
  onReset,
}: {
  round: number;
  available: number;
  onReset: () => void;
}) {
  return (
    <section className={styles.roundInfo} aria-labelledby="round-info-title">
      <div className={styles.panelHeading}>
        <Grid3X3 aria-hidden="true" />
        <div>
          <span>معلومات الجولة</span>
          <h2 id="round-info-title">الجولة {formatNumber(round)}</h2>
        </div>
      </div>
      <dl className={styles.roundStats}>
        <div>
          <dt>الخلايا المتاحة</dt>
          <dd>{formatNumber(available)}</dd>
        </div>
        <div>
          <dt>مدة السؤال</dt>
          <dd>15 ثانية</dd>
        </div>
      </dl>
      <button className={styles.resetButton} type="button" onClick={onReset}>
        <RotateCcw aria-hidden="true" />
        بدء جولة جديدة
      </button>
    </section>
  );
}
