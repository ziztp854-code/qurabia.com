import type { KingdomsConfig, Village } from '@/lib/kingdoms/types';
import { villageVisualPresentation } from '@/lib/kingdoms/village/visual-tier';
import { number } from '../shared';
import styles from './village-progress.module.css';

/** Displays the server snapshot; never derives or awards gameplay progression. */
export function VillageProgress({
  village,
  config,
  now,
  onOpenConstruction,
  onOpenMilitary,
  onOpenActivity,
}: {
  village: Village;
  config: KingdomsConfig;
  now?: number;
  onOpenConstruction?: () => void;
  onOpenMilitary?: () => void;
  onOpenActivity?: () => void;
}) {
  const progression = village.progression;
  if (!progression) return null;
  const { level, rank, xp, levelStartXp, nextLevelXp, power, requirements, visualTier } = progression;
  const span = nextLevelXp === null ? 1 : Math.max(1, nextLevelXp - levelStartXp);
  const earned = Math.max(0, Math.min(span, xp - levelStartXp));
  const look = villageVisualPresentation(visualTier);
  const queue =
    village.constructionQueue?.filter((item) => item.status === 'BUILDING' || item.status === 'QUEUED') ?? [];
  const active = queue.find((item) => item.status === 'BUILDING');
  const queued = queue.filter((item) => item.status === 'QUEUED').length;
  const remaining =
    now !== undefined && (active || village.build)
      ? Math.max(0, Math.ceil(((active?.endsAt ?? village.build!.endsAt) - now) / 1000))
      : undefined;
  return (
    <section className={styles.progression} aria-label="تقدم القرية" data-visual-tier={visualTier}>
      <div className={styles.identity}>
        <strong className={styles.name}>{village.name}</strong>
        <span aria-label="مرتبة المظهر">{look.label}</span>
      </div>
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
      <div className={styles.shortcuts} role="navigation" aria-label="تنقل القرية">
        <button type="button" className={styles.compact} onClick={onOpenConstruction}>
          البناء
          <small>
            {active || village.build
              ? `جارٍ${queued ? ` · ${number(queued)} في الانتظار` : ''}${remaining !== undefined ? ` · ${number(remaining)} ث` : ''}`
              : queued
                ? `${number(queued)} في الانتظار`
                : 'لا بناء'}
          </small>
        </button>
        <button type="button" className={styles.compact} onClick={onOpenMilitary}>
          العسكر
          <small>{village.training ? 'تدريب جارٍ' : 'عرض الثكنة'}</small>
        </button>
        <button type="button" className={styles.compact} onClick={onOpenActivity}>
          النشاط
          <small>البناء والعسكر والتحركات</small>
        </button>
      </div>
    </section>
  );
}
