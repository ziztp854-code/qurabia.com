'use client';
import { useState } from 'react';
import { Button, Select } from '@/components/ui';
import { villageBuildingRegistry, type VillageBuildingId } from '@/lib/kingdoms/village/buildingRegistry';
import { getVillagePlacement, getVillageRect, VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import { createCamera, focusCamera } from '@/lib/kingdoms/village/cameraMath';
import type { CameraSnapshot, VillageDebugOptions, WorldRect } from '@/lib/kingdoms/village/types';
import type { WorldView } from '../shared';
import styles from './village-scene.module.css';

export function VillageDebug({
  view,
  options,
  onChange,
  getCamera,
}: {
  view: WorldView;
  options: VillageDebugOptions;
  onChange: (options: VillageDebugOptions) => void;
  getCamera?: () => CameraSnapshot | undefined;
}) {
  const [copied, setCopied] = useState('');
  if (process.env.NODE_ENV !== 'development') return null;
  const building = options.building ?? 'hall';
  const rect = getVillageRect(building, options);
  const placement = {
    ...getVillagePlacement(building, options),
    focusScale: options.placementOverrides?.[building]?.focusScale ??
      focusCamera(getCamera?.() ?? createCamera({ width: 768, height: 512 }), rect).zoom,
  };
  function updateRect(field: keyof WorldRect, value: number) {
    if (!Number.isFinite(value)) return;
    const limit = field === 'x' ? VILLAGE_WORLD.width - rect.width
      : field === 'y' ? VILLAGE_WORLD.height - rect.height
      : field === 'width' ? VILLAGE_WORLD.width - rect.x
      : VILLAGE_WORLD.height - rect.y;
    onChange({
      ...options,
      rectOverrides: {
        ...options.rectOverrides,
        [building]: {
          ...rect,
          [field]: Math.max(
            field === 'width' || field === 'height' ? 1 : 0,
            Math.min(limit, value),
          ),
        },
      },
    });
  }
  function updatePlacement(field: 'focusX' | 'focusY' | 'focusScale' | 'zIndex', value: number) {
    if (!Number.isFinite(value)) return;
    const min = field === 'focusScale' ? 1.6 : 0;
    const max = field === 'focusScale' ? 3.5 : field === 'focusX'
      ? VILLAGE_WORLD.width : field === 'focusY' ? VILLAGE_WORLD.height : 2048;
    onChange({
      ...options,
      placementOverrides: {
        ...options.placementOverrides,
        [building]: {
          ...options.placementOverrides?.[building],
          [field]: Math.max(min, Math.min(max, value)),
        },
      },
    });
  }
  const config = { id: building, ...rect, focusX: placement.focusX, focusY: placement.focusY,
    focusScale: placement.focusScale, zIndex: placement.zIndex, visualLevel: options.buildingLevel ?? 1 };
  return (
    <details className={styles.debug}>
      <summary>معايرة مشهد القرية — وضع التطوير</summary>
      <div className={styles.debugFields}>
        <Select
          label="المبنى للمعايرة"
          value={building}
          onChange={(event) => onChange({ ...options, building: event.target.value as VillageBuildingId })}
        >
          {villageBuildingRegistry.map((entry) => (
            <option value={entry.id} key={entry.id}>
              {entry.classification === 'existing' && entry.building ? view.config.buildings[entry.building].name : entry.name}
            </option>
          ))}
        </Select>
        <label>
          المستوى المرئي التجريبي
          <input
            type="number"
            min={1}
            max={5}
            value={options.buildingLevel ?? 1}
            onChange={(event) =>
              onChange({
                ...options,
                buildingLevel: Math.max(1, Math.min(5, Number(event.target.value))),
              })
            }
          />
        </label>
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <label key={field}>
            {field}
            <input
              dir="ltr"
              type="number"
              value={rect[field]}
              onChange={(event) => updateRect(field, Number(event.target.value))}
            />
          </label>
        ))}
        {(['focusX', 'focusY', 'focusScale', 'zIndex'] as const).map((field) => (
          <label key={field}>
            {field}
            <input dir="ltr" type="number" step={field === 'focusScale' ? 0.1 : 1}
              value={placement[field]}
              onChange={(event) => updatePlacement(field, Number(event.target.value))} />
          </label>
        ))}
      </div>
      <div className={styles.debugChecks}>
        <label>
          <input
            type="checkbox"
            checked={!!options.hitboxes}
            onChange={(event) => onChange({ ...options, hitboxes: event.target.checked })}
          />
          مناطق النقر
        </label>
        <label>
          <input
            type="checkbox"
            checked={!!options.coordinates}
            onChange={(event) => onChange({ ...options, coordinates: event.target.checked })}
          />
          إحداثيات العالم
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.npcs !== false}
            onChange={(event) => onChange({ ...options, npcs: event.target.checked })}
          />
          السكان المتحركون
        </label>
        <label>
          <input
            type="checkbox"
            checked={options.animations !== false}
            onChange={(event) => onChange({ ...options, animations: event.target.checked })}
          />
          الحركة البيئية
        </label>
      </div>
      <p>المعاينة محلية؛ لا تغيّر مستويات المباني أو الموارد المحفوظة.</p>
      <Button variant="outline" onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
          setCopied('تم نسخ إعدادات المبنى.');
        } catch {
          setCopied('تعذر النسخ؛ يمكنك نسخ الإعدادات المعروضة أدناه.');
        }
      }}>Copy Config</Button>
      <span role="status">{copied}</span>
      <pre>{JSON.stringify(config, null, 2)}</pre>
    </details>
  );
}
