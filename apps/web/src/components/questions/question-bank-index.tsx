import { formatNumber } from '@/lib/utils';
import {
  BookMarked,
  Calculator,
  Cpu,
  FlaskConical,
  Globe2,
  Landmark,
  Lightbulb,
  MoonStar,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  aggregateCategoriesIntoDomains,
  type MasterDomainAggregation,
  type MasterDomainId,
} from '@/lib/questions/bank-index';
import { fillPercent } from '@/lib/questions/bank-display';
import styles from './question-bank-index.module.css';

export interface QuestionBankIndexProps {
  categories: Array<{
    id: string;
    name: string;
    _count?: { questions: number };
  }>;
  activeDomain?: string;
  activeCanonical?: string;
  activeView?: 'stage' | 'list';
  totalQuestionsCount?: number;
  publishedCount?: number;
  draftCount?: number;
  archivedCount?: number;
  categoryCount?: number;
}

const DOMAIN_ICONS: Record<MasterDomainId, LucideIcon> = {
  islamic: MoonStar,
  general: Lightbulb,
  geography: Globe2,
  history: Landmark,
  science: FlaskConical,
  literature: BookMarked,
  sports: Trophy,
  logic: Calculator,
  tech: Cpu,
};

function questionsHref(domain?: string, canonical?: string, view?: string) {
  const params = new URLSearchParams();
  if (domain) params.set('domain', domain);
  if (canonical) params.set('canonical', canonical);
  if (view === 'list') params.set('view', 'list');
  const query = params.toString();
  return query ? `/questions?${query}` : '/questions';
}

export function QuestionBankStats({
  categories,
  totalQuestionsCount = 0,
  publishedCount = 0,
  draftCount = 0,
  categoryCount = 0,
}: Pick<
  QuestionBankIndexProps,
  'categories' | 'totalQuestionsCount' | 'publishedCount' | 'draftCount' | 'categoryCount'
>) {
  const domainAggregations: MasterDomainAggregation[] = aggregateCategoriesIntoDomains(categories);
  const calculatedTotal = domainAggregations.reduce((sum, d) => sum + d.totalQuestions, 0);
  const displayTotal = totalQuestionsCount > 0 ? totalQuestionsCount : calculatedTotal;
  const displayCategories = categoryCount > 0 ? categoryCount : categories.length;
  const activeDomains = domainAggregations.filter((item) => item.totalQuestions > 0).length;
  const publishedFill = fillPercent(publishedCount, displayTotal);
  const draftFill = fillPercent(draftCount, displayTotal);
  const domainFill = fillPercent(activeDomains, 9);

  return (
    <section className={styles.inventory} aria-label="إحصاءات البنك">
      <article className={styles.inventoryHero} data-tone="total">
        <span className={styles.inventorySlit} aria-hidden="true" />
        <span className={styles.filmIndex}>01 · الخزانة</span>
        <span className={styles.statValue}>{formatNumber(displayTotal)}</span>
        <span className={styles.statLabel}>إجمالي الأسئلة</span>
        <span
          className={styles.meterTrack}
          aria-hidden="true"
          style={{ '--fill': `${publishedFill}%` } as CSSProperties}
        >
          <span className={styles.meterFill} />
        </span>
      </article>
      <div className={styles.inventoryMeters}>
        <article className={styles.statCard} data-tone="published">
          <span className={styles.statValue}>{formatNumber(publishedCount)}</span>
          <span className={styles.statLabel}>منشور</span>
          <span
            className={styles.meterTrack}
            aria-hidden="true"
            style={{ '--fill': `${publishedFill}%` } as CSSProperties}
          >
            <span className={styles.meterFill} />
          </span>
        </article>
        <article className={styles.statCard} data-tone="draft">
          <span className={styles.statValue}>{formatNumber(draftCount)}</span>
          <span className={styles.statLabel}>مسودة</span>
          <span
            className={styles.meterTrack}
            aria-hidden="true"
            style={{ '--fill': `${draftFill}%` } as CSSProperties}
          >
            <span className={styles.meterFill} />
          </span>
        </article>
        <article className={styles.statCard} data-tone="categories">
          <span className={styles.statValue}>{formatNumber(displayCategories)}</span>
          <span className={styles.statLabel}>تصنيفات</span>
          <span className={styles.statHint}>{formatNumber(activeDomains)} مجالات نشطة</span>
          <span
            className={styles.meterTrack}
            aria-hidden="true"
            style={{ '--fill': `${domainFill}%` } as CSSProperties}
          >
            <span className={styles.meterFill} />
          </span>
        </article>
      </div>
    </section>
  );
}

export function QuestionBankIndex({
  categories,
  activeDomain,
  activeCanonical,
  activeView,
}: QuestionBankIndexProps) {
  const domainAggregations: MasterDomainAggregation[] = aggregateCategoriesIntoDomains(categories);
  const maxQuestions = Math.max(1, ...domainAggregations.map((item) => item.totalQuestions));

  return (
    <section className={styles.domainSection} aria-labelledby="bank-index-title">
      <div className={styles.domainHeader}>
        <div className={styles.domainHeaderInfo}>
          <p className={styles.filmIndex}>02 · الأطلس</p>
          <h2 id="bank-index-title" className={styles.domainTitle}>
            فهرس المجالات المعرفية
          </h2>
          <p className={styles.domainSubtitle}>
            تصفح الأسئلة حسب المجال، ثم اختر التصنيف دون تكرار الأسماء المترادفة.
          </p>
        </div>
        {activeDomain ? (
          <Link href={questionsHref(undefined, undefined, activeView)} className={styles.resetLink}>
            كل المجالات
          </Link>
        ) : null}
      </div>

      <div className={styles.domainGrid}>
        {domainAggregations.map(({ domain, totalQuestions, categories: subcats }) => {
          const isDomainActive = activeDomain === domain.id;
          const Icon = DOMAIN_ICONS[domain.id];
          const chips = [...subcats]
            .filter((chip) => chip.questionCount > 0)
            .sort((a, b) => b.questionCount - a.questionCount || a.name.localeCompare(b.name, 'ar'));
          const visibleChips = chips.slice(0, 4);
          const hiddenCount = chips.length - visibleChips.length;
          const fill = fillPercent(totalQuestions, maxQuestions);

          return (
            <article
              key={domain.id}
              className={`${styles.domainCard} ${isDomainActive ? styles.domainCardActive : ''} ${totalQuestions === 0 ? styles.domainCardMuted : ''}`}
              data-domain={domain.id}
              data-selected={isDomainActive ? 'true' : undefined}
            >
              <Link
                href={questionsHref(domain.id, undefined, activeView)}
                className={styles.domainCardLink}
                aria-current={isDomainActive && !activeCanonical ? 'page' : undefined}
              >
                <div className={styles.domainCardTop}>
                  <span className={styles.domainIconWrap} aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className={styles.domainCardBadge}>
                    {formatNumber(totalQuestions)} سؤال
                  </span>
                </div>
                <div className={styles.domainCardBody}>
                  <h3 className={styles.domainCardTitle}>{domain.name}</h3>
                  <p className={styles.domainCardDesc}>{domain.description}</p>
                </div>
                <div className={styles.domainCardFooter}>
                  <span className={styles.domainBrowse}>تصفح الأسئلة</span>
                  {chips.length > 0 ? (
                    <span className={styles.domainSubcount}>
                      {formatNumber(chips.length)} تصنيفات
                    </span>
                  ) : null}
                </div>
                <span
                  className={styles.domainMeter}
                  aria-hidden="true"
                  style={{ '--fill': `${fill}%` } as CSSProperties}
                >
                  <span />
                </span>
              </Link>

              <div className={styles.subcategoriesList}>
                {chips.length === 0 ? (
                  <span className={styles.emptyChip}>لا أسئلة بعد</span>
                ) : (
                  <>
                    {visibleChips.map((chip) => (
                      <Link
                        key={chip.name}
                        href={questionsHref(domain.id, chip.name, activeView)}
                        className={`${styles.subcatChip} ${activeCanonical === chip.name ? styles.subcatChipActive : ''}`}
                        aria-current={activeCanonical === chip.name ? 'page' : undefined}
                      >
                        {chip.name}
                        <b>{formatNumber(chip.questionCount)}</b>
                      </Link>
                    ))}
                    {hiddenCount > 0 ? (
                      <Link href={questionsHref(domain.id, undefined, activeView)} className={styles.moreChip}>
                        +{formatNumber(hiddenCount)} تصنيفات
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
