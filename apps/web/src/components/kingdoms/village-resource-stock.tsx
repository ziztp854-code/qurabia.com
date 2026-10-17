'use client';

import { storageCapacity } from '@/lib/kingdoms/simulation';
import { compactNumber, number, type GameProps } from './shared';
import { ResourceIcon } from './resource-icon';
import { useResourceStock } from './use-resource-stock';
import styles from './kingdoms.module.css';

const resourceOrder = ['wood', 'stone', 'iron', 'food', 'gold'] as const;
const resourceNames = {
  wood: 'الخشب',
  stone: 'الحجر',
  iron: 'الحديد',
  food: 'الطعام',
  gold: 'الذهب',
};

export function VillageResourceStock({ view, village }: Pick<GameProps, 'view' | 'village'>) {
  const stock = useResourceStock(view, village);
  return (
    <section aria-label="موارد القرية" className={styles.resources} tabIndex={0}>
      {resourceOrder.map((resource) => {
        const cap = storageCapacity(view.config, village);
        const fill = Math.min(100, (stock[resource] / cap) * 100);
        return (
          <div
            key={resource}
            className={styles.resource}
            data-resource={resource}
            data-full={fill >= 95}
            title={`${resourceNames[resource]} ${number(stock[resource])} · السعة ${number(cap)}`}
          >
            <ResourceIcon resource={resource} size={32} hud />
            <span>{resourceNames[resource]}</span>
            <strong
              role="group"
              aria-label={`${resourceNames[resource]}: ${number(stock[resource])}`}
            >
              <bdi className={styles.resourceExact} aria-hidden="true">
                {number(stock[resource])}
              </bdi>
              <bdi className={styles.resourceCompact} data-compact-value aria-hidden="true">
                {compactNumber(stock[resource])}
              </bdi>
            </strong>
            <span className={styles.resourceCapacity}>من {number(cap)}</span>
            <em className={styles.capacity} aria-hidden="true" title={`السعة ${number(cap)}`}>
              <i style={{ inlineSize: `${fill}%` }} />
            </em>
          </div>
        );
      })}
    </section>
  );
}
