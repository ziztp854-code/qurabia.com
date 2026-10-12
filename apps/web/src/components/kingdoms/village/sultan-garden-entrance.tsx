'use client';

import { farmGrowth, farmState } from '@/lib/kingdoms/sultan-farm';
import type { Village } from '@/lib/kingdoms/types';
import { useViewClock } from '../use-view-clock';
import type { KingdomsView } from '@/lib/kingdoms/types';
import { sultanGardenEntranceRect, type CityCompositionId } from '@/lib/kingdoms/village/city-composition';
import styles from './sultan-garden-entrance.module.css';

export { sultanGardenEntranceRect } from '@/lib/kingdoms/village/city-composition';

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
      style={{ left: rect.x, top: rect.y + rect.height / 2, width: rect.width, height: rect.height }}
      data-sultan-garden-entrance
      aria-label={`افتح حديقة السلطان، ${ready} أحواض جاهزة للجمع`}
      onClick={onOpen}
    />
  );
}
