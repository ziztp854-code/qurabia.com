'use client';
import { Button } from '@/components/ui';
import { gardenMilestones } from '@/lib/kingdoms/sultan-farm';
import type { GameProps } from './shared';
import { RoyalReportsCenter } from './royal-reports-center';
import styles from './kingdoms.module.css';
const quests = [
  { id: 'builder', name: 'بناة المملكة', description: 'طوّر مباني قريتك لبدء نهضة المملكة.' },
  { id: 'commander', name: 'راية الجيش', description: 'جهّز عشر وحدات على الأقل في إحدى قراك.' },
  { id: 'merchant', name: 'طريق التجارة', description: 'أتمم تبادلًا تجاريًا مع مملكة أخرى.' },
  { id: 'founder', name: 'آفاق جديدة', description: 'أسّس قرية ثانية ووسّع مملكتك.' },
] as const;

export function ReportsPanel({ view, busy, send }: GameProps) {
  return (
    <>
      <RoyalReportsCenter view={view} />
      <details className={styles.panel}>
        <summary>المهام والإنجازات</summary>
        <section className={styles.panel}>
          <h2>المهام والإنجازات</h2>
          {quests.map((quest) => (
            <article className={styles.row} key={quest.id}>
              <div>
                <h3>{quest.name}</h3>
                <p className={styles.cost}>{quest.description}</p>
              </div>
              <Button
                variant="outline"
                disabled={busy || view.player?.claims.includes(quest.id)}
                onClick={() => void send({ type: 'claim', mission: quest.id })}
              >
                {view.player?.claims.includes(quest.id)
                  ? 'تم استلام المكافأة'
                  : 'تحقق واستلم المكافأة'}
              </Button>
            </article>
          ))}
          <h3>إنجازات مكتسبة</h3>
          {view.player?.achievements.length ? (
            <ul>
              {view.player.achievements.map((achievement) => (
                <li key={achievement}>
                  {quests.find((quest) => quest.id === achievement)?.name ??
                    gardenMilestones.find((goal) => goal.id === achievement)?.name ??
                    achievement}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>أكمل مهامك لإضافة أول إنجاز.</p>
          )}
        </section>
      </details>
    </>
  );
}
