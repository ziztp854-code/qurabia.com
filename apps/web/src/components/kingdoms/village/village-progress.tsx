import type { KingdomsConfig, Village } from '@/lib/kingdoms/types';
import { number } from '../shared';
import styles from './village-progress.module.css';

/** Displays the server snapshot; never derives or awards gameplay progression. */
export function VillageProgress({ village, config }: { village: Village; config: KingdomsConfig }) {
  const progression = village.progression;
  if (!progression) return null;
  const { level, rank, xp, levelStartXp, nextLevelXp, power, requirements } = progression;
  const span = nextLevelXp === null ? 1 : Math.max(1, nextLevelXp - levelStartXp);
  const earned = Math.max(0, Math.min(span, xp - levelStartXp));
  return (
    <section className={styles.progression} aria-label="تقدم القرية" data-visual-tier={progression.visualTier}>
      <div className={styles.facts}>
        <strong aria-label="مستوى القرية">المستوى <bdi>{number(level)}</bdi></strong>
        <span>{rank}</span>
        <strong aria-label="قوة القرية">القوة <bdi>{number(power.total)}</bdi></strong>
      </div>
      <div className={styles.experience}>
        <span>الخبرة <bdi>{number(xp)}</bdi>{nextLevelXp !== null && <> / <bdi>{number(nextLevelXp)}</bdi></>}</span>
        {nextLevelXp === null ? <span>بلغت القرية أعلى مستوى</span> : (
          <progress aria-label="التقدم إلى المستوى التالي" max={span} value={earned} />
        )}
      </div>
      {requirements.length > 0 && <p className={styles.requirements}>للمستوى التالي: {requirements.map((item) => `${config.buildings[item.building].name} ${number(item.required)}`).join('، ')}</p>}
    </section>
  );
}
