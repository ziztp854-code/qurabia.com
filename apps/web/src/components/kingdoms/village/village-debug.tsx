'use client';
import { Select } from '@/components/ui';
import { buildingKeys, type Building } from '@/lib/kingdoms/types';
import { getBuildingRect, VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import type { VillageDebugOptions, WorldRect } from '@/lib/kingdoms/village/types';
import type { WorldView } from '../shared';
import styles from './village-scene.module.css';

export function VillageDebug({
  view,
  options,
  onChange,
}: {
  view: WorldView;
  options: VillageDebugOptions;
  onChange: (options: VillageDebugOptions) => void;
}) {
  if (process.env.NODE_ENV !== 'development') return null;
  const building = options.building ?? 'hall';
  const rect = getBuildingRect(building, options);
  function updateRect(field: keyof WorldRect, value: number) {
    if (!Number.isFinite(value)) return;
    const limit = field === 'x' || field === 'width' ? VILLAGE_WORLD.width : VILLAGE_WORLD.height;
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
  return (
    <details className={styles.debug}>
      <summary>معايرة مشهد القرية — وضع التطوير</summary>
      <div className={styles.debugFields}>
        <Select
          label="المبنى للمعايرة"
          value={building}
          onChange={(event) => onChange({ ...options, building: event.target.value as Building })}
        >
          {buildingKeys.map((key) => (
            <option value={key} key={key}>
              {view.config.buildings[key].name}
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
      <pre>{JSON.stringify(options.rectOverrides ?? {}, null, 2)}</pre>
    </details>
  );
}
