'use client';

import { useState } from 'react';
import { Castle } from 'lucide-react';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { villageProgress } from '@/lib/kingdoms/stages';
import { resourceKeys, unitKeys } from '@/lib/kingdoms/types';
import { date, labels, number, rateAmount, type GameProps } from './shared';
import { ResourceIcon } from './resource-icon';
import styles from './village.module.css';

/**
 * شريط القرية العلوي. الأرقام من لقطة الخادم: المخزون والإنتاج الصافي والسعة.
 * ميزان الغذاء (الإجمالي / الإعاشة / الصافي) يظهر عند الطلب فقط.
 */
export function VillageHero({ view, village }: Pick<GameProps, 'view' | 'village'>) {
  const progress = villageProgress(village, view.config);
  const level = village.progression?.level ?? progress.levels;
  const power = village.progression?.power.total;
  const capacity = storageCapacity(view.config, village);
  const rate = view.productionRates[village.id];
  const breakdown = view.productionBreakdown?.[village.id];
  const protectedUntil = view.player?.protectionUntil ?? 0;
  const constructing = village.build ? view.config.buildings[village.build.building].name : null;
  const troops = unitKeys.reduce((sum, unit) => sum + village.troops[unit], 0);
  const [foodOpen, setFoodOpen] = useState(false);
  const goal = progress.next
    ? `نحو ${progress.next.name}`
    : 'المرحلة العليا مكتملة';

  return (
    <section className={styles.hero} aria-label="بطاقة القرية">
      <div className={styles.identity}>
        <span className={styles.crest} aria-hidden="true">
          <Castle size={16} />
        </span>
        <h2 className={styles.name}>{village.name}</h2>
        <span className={styles.level} data-tone="gold">
          المستوى <bdi>{number(level)}</bdi>
        </span>
        {power !== undefined && (
          <span className={styles.power}>
            القوة <bdi>{number(power)}</bdi>
          </span>
        )}
        <span className={styles.goal}>{goal}</span>
        {constructing && <span className={styles.tag}>قيد التطوير: {constructing}</span>}
        {protectedUntil > view.serverNow && (
          <span className={styles.tag}>حماية حتى {date(protectedUntil)}</span>
        )}
      </div>
      <section className={styles.stock} aria-label="موارد القرية">
        <ul>
          {resourceKeys.map((key) => {
            const fill =
              capacity > 0 ? Math.min(100, Math.round((village.resources[key] / capacity) * 100)) : 0;
            const full = capacity > 0 && village.resources[key] >= capacity;
            const hourly = rate[key];
            return (
              <li
                key={key}
                className={styles.stockCell}
                data-full={full || undefined}
                data-open={key === 'food' && foodOpen ? 'true' : undefined}
              >
                <span className={styles.stockHead}>
                  <ResourceIcon resource={key} size={24} />
                  <span className={styles.stockLabel}>{labels[key]}</span>
                </span>
                <span className={styles.stockValue}>{number(village.resources[key])}</span>
                {key === 'food' ? (
                  <button
                    type="button"
                    className={styles.stockRate}
                    aria-expanded={foodOpen}
                    onClick={() => setFoodOpen((open) => !open)}
                  >
                    {hourly > 0 ? `+${rateAmount(hourly)}/ساعة` : 'لا إنتاج الآن'}
                  </button>
                ) : (
                  <span className={styles.stockRate}>
                    {hourly > 0 ? `+${rateAmount(hourly)}/ساعة` : 'لا إنتاج الآن'}
                  </span>
                )}
                {full && <span className={styles.fullBadge}>ممتلئ</span>}
                <span
                  role="progressbar"
                  aria-label={`امتلاء مخزن ${labels[key]}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fill}
                  aria-valuetext={`${number(fill)}٪ من السعة`}
                  className={styles.bar}
                >
                  <span style={{ width: `${fill}%` }} />
                </span>
                {key === 'food' && breakdown && (
                  <span className={styles.foodDetail}>
                    إجمالي {rateAmount(breakdown.gross.food)} قبل إعاشة الجيش · إعاشة{' '}
                    {rateAmount(breakdown.upkeep)} · صافٍ {rateAmount(breakdown.net.food)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className={styles.troops}>
          <span>الوحدات الجاهزة</span>
          <bdi>{number(troops)}</bdi>
        </p>
      </section>
    </section>
  );
}
