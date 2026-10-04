'use client';

import { useId } from 'react';
import { Castle, Check, Coins, Shield } from 'lucide-react';
import { buildingKeys } from '@/lib/kingdoms/types';
import { buildingGroups, buildingStatusLabels, getBuildingPresentation } from '@/lib/kingdoms/village/buildingConfig';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import { number, type GameProps } from '../shared';
import styles from './village-directory.module.css';

type Props = Pick<GameProps, 'view' | 'village'> & {
  selected: VillageSelection | null;
  onSelect: (building: VillageSelection) => void;
};
const entries: VillageSelection[] = buildingKeys.flatMap((building): VillageSelection[] =>
  building === 'barracks' ? [building, 'stable', 'rally'] : [building]);
const groupIcons = { economy: Coins, military: Shield, civic: Castle };

export function VillageDirectory({ view, village, selected, onSelect }: Props) {
  const id = useId();
  const presentation = (building: VillageSelection) => {
    const base = getBuildingPresentation(
      building === 'stable' || building === 'rally' ? 'barracks' : building,
      village,
      view.config,
    );
    if (building === 'stable')
      return { ...base, name: 'الإسطبل', description: 'مبنى الفرسان المستقل عن منطقة الثكنة' };
    if (building === 'rally')
      return {
        ...base,
        name: 'نقطة تجمع الجيوش',
        description: 'مركز القيادة العسكرية فوق القوات والحركات الحالية',
      };
    return base;
  };
  const active = selected ? presentation(selected) : null;
  return (
    <nav className={styles.directory} aria-label="دليل مباني القرية">
      <div className={styles.heading}>
        <h3>مباني القرية</h3>
        <span>{number(entries.length)} موقعًا</span>
      </div>
      <p className={styles.selection} role="status" aria-live="polite">
        {active ? <><strong>{active.name}</strong><span>{active.description}</span></> : 'اختر مبنى من الدليل أو اضغط عليه في المشهد.'}
      </p>
      <div className={styles.list}>
        {entries.map((building) => {
          const item = presentation(building);
          const group = building === 'stable' || building === 'rally' ? 'military' : buildingGroups[building];
          const Icon = groupIcons[group];
          return (
            <button key={building} type="button" className={styles.item}
              aria-label={`اختيار ${item.name}`} aria-describedby={`${id}-${building}-level ${id}-${building}`}
              aria-pressed={selected === building} data-state={item.status}
              onClick={() => onSelect(building)}>
              <Icon className={styles.icon} size={19} aria-hidden="true" />
              <span className={styles.name}>{item.name}
                <small id={`${id}-${building}-level`}>{item.level > 0 ? `مستوى ${number(item.level)}` : 'لم يُبنَ'}</small>
              </span>
              <span id={`${id}-${building}`} className={styles.state}>{buildingStatusLabels[item.status]}</span>
              {selected === building && <Check className={styles.check} size={15} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
