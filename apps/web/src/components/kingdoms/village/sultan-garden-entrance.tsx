'use client';

import type { CSSProperties } from 'react';
import { Sprout } from 'lucide-react';
import { farmGrowth, farmState } from '@/lib/kingdoms/sultan-farm';
import type { Village } from '@/lib/kingdoms/types';
import { useViewClock } from '../use-view-clock';
import type { KingdomsView } from '@/lib/kingdoms/types';
import type { CityCompositionId } from '@/lib/kingdoms/village/city-composition';
import styles from './sultan-garden-entrance.module.css';

// Match the existing palace courtyard in each independently authored raster.
// This entrance is not an economic building and never shifts building placements.
export function sultanGardenEntranceRect(composition: CityCompositionId) {
  return composition === 'desktop'
    ? { x: 0.418 * 1600, y: 0.18 * 900, width: 0.22 * 1600, height: 0.085 * 900 }
    : { x: 0.28 * 900, y: 0.199 * 1600, width: 0.37 * 900, height: 0.058 * 1600 };
}

export function SultanGardenEntrance({
  composition,
  view,
  village,
  onOpen,
}: {
  composition: CityCompositionId;
  view: KingdomsView;
  village: Village;
  onOpen: () => void;
}) {
  const farm = farmState(village);
  const rect = sultanGardenEntranceRect(composition);
  const deadline = Math.max(view.serverNow, ...farm.plots.map((plot) => plot.plant?.readyAt ?? 0));
  const now = useViewClock(view, deadline, `garden-entrance:${village.id}`);
  const ready = farm.plots.filter(
    (plot) => plot.plant && farmGrowth(plot.plant, now).stage === 'ripe',
  ).length;
  return (
    <button
      type="button"
      className={styles.entrance}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height } as CSSProperties}
      data-sultan-garden-entrance
      aria-label={`افتح حديقة السلطان، ${ready} أحواض جاهزة للجمع`}
      onClick={onOpen}
    >
      <span className={styles.gate} aria-hidden="true">
        <svg viewBox="0 0 164 50">
          <path
            className={styles.stone}
            d="M68 48V24Q82 3 96 24V48M62 48V20Q82 -6 102 20V48M55 48H109"
          />
          {[20, 39, 125, 144].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i % 2 ? 30 : 38})`}>
              <path className={styles.stem} d="M0 9V-6M0 4L-7 -2M0 2L7 -4" />
              <g className={i < 2 ? styles.rose : styles.violet}>
                <ellipse cx="-4" cy="-8" rx="5" ry="3" />
                <ellipse cx="4" cy="-8" rx="5" ry="3" />
                <ellipse cy="-12" rx="3" ry="5" />
              </g>
              <circle className={styles.ivory} cy="-8" r="2" />
            </g>
          ))}
        </svg>
        <span>
          <Sprout size={16} />
          حديقة السلطان
          <small>
            {ready ? `${ready.toLocaleString('ar-SA')} أحواض جاهزة` : 'زراعة · أوسمة · زينة'}
          </small>
        </span>
      </span>
    </button>
  );
}
