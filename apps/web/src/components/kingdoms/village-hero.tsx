'use client';

import { Castle, Crown, Shield } from 'lucide-react';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { supremeStage, villageProgress } from '@/lib/kingdoms/stages';
import { buildingKeys, resourceKeys } from '@/lib/kingdoms/types';
import { date, labels, number, type GameProps } from './shared';
import { ResourceIcon } from './resource-icon';
import styles from './village.module.css';

/**
 * بطاقة القرية: هوية القرية وموقفها وقياساتها. كل رقم هنا مشتق من لقطة الخادم،
 * والإنتاج والسعة من قاعدتي المحرك نفسهما لا من تقدير في المتصفح.
 */
export function VillageHero({ view, village }: Pick<GameProps, 'view' | 'village'>) {
  const progress = villageProgress(village, view.config);
  const built = buildingKeys.filter((key) => village.buildings[key] > 0).length;
  const capacity = storageCapacity(view.config, village);
  const rate = view.productionRates[village.id];
  const protectedUntil = view.player?.protectionUntil ?? 0;
  const constructing = village.build ? view.config.buildings[village.build.building].name : null;
  const goal = progress.next
    ? `نحو ${progress.next.name} · ${number(Math.round((progress.nextFraction ?? 0) * 100))}٪`
    : `${supremeStage.name} مكتملة`;

  return (
    <section className={styles.hero} aria-label="بطاقة القرية">
      <div className={styles.crest} aria-hidden="true">
        <Castle size={26} />
      </div>
      <div className={styles.identity}>
        <p className={styles.eyebrow}>{view.player?.name ?? view.worldName}</p>
        <h2 className={styles.name}>{village.name}</h2>
        <p className={styles.sub}>
          <span className={styles.coords} dir="ltr">
            X {village.x} · Y {village.y}
          </span>
          <span>الموسم {number(view.season.number)}</span>
          <span>{number(built)} مبنى مبني</span>
        </p>
        <div className={styles.tags}>
          <span className={styles.tag} data-tone="gold">
            {!progress.next && <Crown size={13} aria-hidden="true" />}
            {goal}
          </span>
          {constructing && (
            <span className={styles.tag} data-tone="live">
              قيد التطوير: {constructing}
            </span>
          )}
          {protectedUntil > view.serverNow && (
            <span className={styles.tag} data-tone="safe">
              <Shield size={13} aria-hidden="true" />
              حماية حتى {date(protectedUntil)}
            </span>
          )}
        </div>
      </div>
      <dl className={styles.measures}>
        <div className={styles.measure}>
          <dt>مستويات القرية</dt>
          <dd className={styles.measureValue}>
            {number(progress.levels)}
            <small>/ {number(progress.maxLevels)}</small>
          </dd>
          <dd className={styles.bar} aria-hidden="true">
            <span style={{ width: `${progress.percent}%` }} />
          </dd>
        </div>
        <div className={styles.measure}>
          <dt>المباني المبنية</dt>
          <dd className={styles.measureValue}>
            {number(built)}
            <small>/ {number(buildingKeys.length)}</small>
          </dd>
          <dd className={styles.bar} aria-hidden="true">
            <span style={{ width: `${Math.round((built / buildingKeys.length) * 100)}%` }} />
          </dd>
        </div>
        <div className={styles.measure}>
          <dt>مباني المرحلة العليا</dt>
          <dd className={styles.measureValue}>
            {number(progress.topBuildings)}
            <small>/ {number(buildingKeys.length)}</small>
          </dd>
          <dd className={styles.bar} aria-hidden="true">
            <span
              style={{
                width: `${Math.round((progress.topBuildings / buildingKeys.length) * 100)}%`,
              }}
            />
          </dd>
        </div>
        <div className={styles.measure}>
          <dt>سعة المخزن لكل مورد</dt>
          <dd className={styles.measureValue}>
            {number(capacity)}
            <small>وحدة</small>
          </dd>
          <dd className={styles.measureNote}>
            النمو يتوقف عند السعة حتى تطوّر المخزن أو تصرف الفائض.
          </dd>
        </div>
      </dl>
      <ul className={styles.stock}>
        {resourceKeys.map((key) => {
          const fill =
            capacity > 0 ? Math.min(100, Math.round((village.resources[key] / capacity) * 100)) : 0;
          return (
            <li key={key} className={styles.stockCell}>
              <span className={styles.stockHead}>
                <ResourceIcon resource={key} size={24} />
                {labels[key]}
              </span>
              <span className={styles.stockValue}>{number(village.resources[key])}</span>
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
              <span className={styles.stockRate}>
                {rate[key] > 0 ? `+${number(rate[key])} في الساعة` : 'لا إنتاج الآن'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
