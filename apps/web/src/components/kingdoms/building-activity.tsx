'use client';

import { useEffect, useState } from 'react';
import { maxLevelLabel } from '@/lib/kingdoms/stages';
import type { Village } from '@/lib/kingdoms/types';
import { useViewClock } from './use-view-clock';
import { number } from './shared';
import styles from './building-activity.module.css';

type Props = {
  name: string;
  level: number;
  /** اسم المرحلة العليا عند بلوغها، فتبقى شارة الاكتمال صادقة عبر المواسم. */
  stageName?: string;
  atMaxLevel?: boolean;
  build?: Village['build'];
  serverNow: number;
  x: number;
  y: number;
};

export function BuildingActivity({
  name,
  level,
  stageName,
  atMaxLevel,
  build,
  serverNow,
  x,
  y,
}: Props) {
  const [confirmed, setConfirmed] = useState({ level, celebrate: false });
  const now = useViewClock(
    { serverNow, paused: false },
    build?.endsAt ?? serverNow,
    `activity:${name}:${build?.endsAt ?? 0}`,
  );
  if (confirmed.level !== level) {
    setConfirmed({ level, celebrate: level > confirmed.level });
  }

  useEffect(() => {
    if (!confirmed.celebrate) return;
    const timer = setTimeout(
      () => setConfirmed((current) => ({ ...current, celebrate: false })),
      280,
    );
    return () => clearTimeout(timer);
  }, [confirmed.celebrate, confirmed.level]);

  if (!build && !confirmed.celebrate) return null;
  const remaining = build ? Math.max(0, Math.ceil((build.endsAt - now) / 1000)) : 0;
  const progress =
    build?.startedAt !== undefined && build.endsAt > build.startedAt
      ? Math.min(
          100,
          Math.max(0, ((now - build.startedAt) / (build.endsAt - build.startedAt)) * 100),
        )
      : undefined;
  const countdown = `${Math.floor(remaining / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((remaining % 3600) / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;

  return (
    <div className={styles.site} style={{ left: `${x}%`, top: `${y}%` }}>
      {build ? (
        <>
          <svg className={styles.scaffold} viewBox="0 0 180 120" aria-hidden="true">
            <ellipse className={styles.ground} cx="90" cy="108" rx="79" ry="10" />
            <g className={styles.beams}>
              <path d="M28 105V38h90v67M28 65h90M28 90h90M58 38v67M88 38v67M28 90l30-25 30 25 30-25M28 38l30 27 30-27 30 27" />
              <path d="M129 106V12h-9m9 0h40M124 18l36-6M129 12l-9 94M122 37h7M122 65h7M122 89h7" />
            </g>
            <g className={styles.hoist}>
              <path className={styles.beams} d="M155 14v45" />
              <rect className={styles.bricks} x="142" y="59" width="26" height="13" rx="2" />
              <path className={styles.mortar} d="M142 65h26m-13-6v6m-6 0v7m13-7v7" />
            </g>
            <g className={styles.worker}>
              <circle cx="78" cy="80" r="5" />
              <path d="M78 85v12m0-9 10-4m-10 13-6 10m6-10 7 10" />
              <g className={styles.hammer}>
                <path d="M88 86l9-17m-5-3 10 5" />
              </g>
            </g>
            <g className={styles.dust}>
              <circle cx="58" cy="104" r="4" />
              <circle cx="99" cy="101" r="5" />
              <circle cx="119" cy="106" r="3" />
            </g>
          </svg>
          <div className={styles.badge}>
            <span>{remaining ? 'جارٍ البناء' : 'بانتظار تأكيد الاكتمال'}</span>
            {progress !== undefined && (
              <span
                role="progressbar"
                aria-label={`تقدم بناء ${name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(progress)}
                aria-valuetext={`${number(progress)}٪ من الوقت المجدول`}
                className={styles.track}
              >
                <span style={{ width: `${progress}%` }} />
              </span>
            )}
            {remaining > 0 && (
              <span
                className={styles.countdown}
                dir="ltr"
                aria-label={`الوقت المتبقي لبناء ${name}`}
              >
                {countdown}
              </span>
            )}
          </div>
        </>
      ) : (
        <span role="status" className={styles.complete} data-top={atMaxLevel}>
          اكتمل {name} · المستوى {number(level)}
          {stageName ? ` · ${stageName}` : ''}
          {atMaxLevel ? ` · ${maxLevelLabel}` : ''}
        </span>
      )}
    </div>
  );
}
