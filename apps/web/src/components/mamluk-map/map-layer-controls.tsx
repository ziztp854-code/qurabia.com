'use client';

import { useState } from 'react';
import { Layers } from 'lucide-react';
import styles from './mamluk-world-map.module.css';

export type MapLayerGroup = 'cities' | 'castles' | 'armies' | 'territories' | 'relief';
export const initialMapLayers: Readonly<Record<MapLayerGroup, boolean>> = {
  cities: true,
  castles: true,
  armies: true,
  territories: true,
  relief: true,
};

export function MapLayerControls({
  layers,
  onChange,
  villageWorld,
}: {
  layers: Readonly<Record<MapLayerGroup, boolean>>;
  onChange: (group: MapLayerGroup) => void;
  villageWorld: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.layerControl}>
      <button
        type="button"
        className={styles.control}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Layers size={18} aria-hidden="true" />
        الطبقات
      </button>
      {open && (
        <fieldset className={styles.layerMenu}>
          <legend>طبقات الأطلس</legend>
          {(
            [
              ['cities', 'القرى والمدن'],
              ['castles', 'القلاع'],
              ['armies', 'الجيوش'],
              ['territories', 'حدود الممالك'],
              ['relief', 'التضاريس'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={layers[key]}
                disabled={key === 'castles' && villageWorld}
                onChange={() => onChange(key)}
              />
              {label}
              {key === 'castles' && villageWorld ? ' — غير متاحة' : ''}
            </label>
          ))}
          <label>
            <input type="checkbox" disabled />
            المواقع الاستراتيجية — قريبًا
          </label>
          <label>
            <input type="checkbox" disabled />
            القوافل — قريبًا
          </label>
        </fieldset>
      )}
    </div>
  );
}
