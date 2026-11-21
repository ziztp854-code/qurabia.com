'use client';

import { useId, useRef, useState } from 'react';
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
  referenceOnly = false,
}: {
  layers: Readonly<Record<MapLayerGroup, boolean>>;
  onChange: (group: MapLayerGroup) => void;
  villageWorld: boolean;
  referenceOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const options: readonly (readonly [MapLayerGroup, string])[] = referenceOnly
    ? [
        ['cities', 'المدن'],
        ['relief', 'التضاريس'],
      ]
    : [
        ['cities', 'القرى والمدن'],
        ['castles', 'القلاع'],
        ['armies', 'الجيوش'],
        ['territories', 'حدود الممالك'],
        ['relief', 'التضاريس'],
      ];
  return (
    <div
      className={styles.layerControl}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          setOpen(false);
      }}
    >
      <button
        type="button"
        ref={trigger}
        className={styles.control}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
      >
        <Layers size={18} aria-hidden="true" />
        الطبقات
      </button>
      {open && (
        <fieldset className={styles.layerMenu} id={menuId}>
          <legend>طبقات الأطلس</legend>
          {options.map(([key, label]) => (
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
        </fieldset>
      )}
    </div>
  );
}
