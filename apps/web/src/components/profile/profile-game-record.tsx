import { Gamepad2, Trophy } from 'lucide-react';
import type { ProfileGameStats } from '@/lib/profile/identity';
import { formatNumber } from '@/lib/utils';
import styles from './profile-game-record.module.css';

export function ProfileGameRecord({ played, wins }: ProfileGameStats) {
  return (
    <section className={styles.record} aria-label="سجل اللعب">
      <header className={styles.heading}>
        <h2>سجل اللعب</h2>
        <p>المسابقات المباشرة المرتبطة بالحساب</p>
      </header>
      <dl className={styles.results}>
        <div className={styles.metric}>
          <dt>
            <Gamepad2 aria-hidden="true" />
            المباريات المكتملة
          </dt>
          <dd>
            <bdi>{formatNumber(played)}</bdi>
          </dd>
        </div>
        <div className={`${styles.metric} ${styles.wins}`}>
          <dt>
            <Trophy aria-hidden="true" />
            الانتصارات
          </dt>
          <dd>
            <bdi>{formatNumber(wins)}</bdi>
          </dd>
        </div>
      </dl>
    </section>
  );
}
