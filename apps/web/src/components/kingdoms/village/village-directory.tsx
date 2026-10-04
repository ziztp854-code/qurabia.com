'use client';

import { useId } from 'react';
import {
  Castle,
  Coins,
  DoorOpen,
  Flag,
  Mountain,
  Pickaxe,
  Shield,
  Store,
  Swords,
  Trees,
  TowerControl,
  Warehouse,
  Wheat,
  type LucideIcon,
} from 'lucide-react';
import {
  buildingStatusLabels,
  getBuildingPresentation,
  villageDistricts,
} from '@/lib/kingdoms/village/buildingConfig';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import { number, type GameProps } from '../shared';
import styles from './village-directory.module.css';

type Props = Pick<GameProps, 'view' | 'village'> & {
  selected: VillageSelection | null;
  onSelect: (building: VillageSelection) => void;
};

const icons: Record<string, LucideIcon> = {
  hall: Castle,
  embassy: Flag,
  barracks: Swords,
  stable: Swords,
  rally: Flag,
  market: Store,
  warehouse: Warehouse,
  treasury: Coins,
  farm: Wheat,
  lumber: Trees,
  quarry: Mountain,
  mine: Pickaxe,
  wall: Shield,
  gate: DoorOpen,
  tower: TowerControl,
};

export function VillageDirectory({ view, village, selected, onSelect }: Props) {
  const id = useId();
  const active = selected
    ? getBuildingPresentation(selected === 'rally' ? 'barracks' : selected, village, view.config)
    : null;
  return (
    <nav className={styles.directory} aria-label="دليل مباني القرية">
      <div className={styles.heading}>
        <h3>مباني القرية</h3>
        <span>خمس مناطق</span>
      </div>
      <p className={styles.selection} role="status" aria-live="polite">
        {active && selected ? (
          <>
            <strong>{selected === 'rally' ? 'نقطة تجمع الجيوش' : active.name}</strong>
            <span>
              {selected === 'rally' ? 'مركز القيادة العسكرية' : active.description}
              {' · '}
              {active.level > 0 ? `المستوى ${number(selected === 'rally' ? village.buildings.barracks : active.level)}` : 'لم يُبنَ'}
              {' · '}
              {buildingStatusLabels[active.status]}
            </span>
          </>
        ) : (
          'اختر مبنى من الدليل أو اضغط عليه في المشهد.'
        )}
      </p>
      <div className={styles.list}>
        {villageDistricts.map((district) => (
          <section key={district.id} className={styles.district} aria-label={district.label} data-district={district.id}>
            <h4>{district.label}</h4>
            {district.entries.map((entry) => {
              const select = entry.select;
              const presented = getBuildingPresentation(
                select === 'rally' ? 'barracks' : select,
                village,
                view.config,
              );
              const name = 'name' in entry ? entry.name : select === 'rally' ? 'نقطة تجمع الجيوش' : presented.name;
              const note = 'note' in entry ? entry.note : select === 'rally' ? 'قيادة عسكرية بلا مبنى مستقل' : null;
              const level = select === 'rally' ? 0 : presented.level;
              const Icon = icons[entry.id] ?? Castle;
              const upgrade = presented.status === 'upgrade' && select !== 'rally' && !note;
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={styles.item}
                  aria-label={`اختيار ${name}`}
                  aria-describedby={`${id}-${entry.id}`}
                  aria-pressed={selected === select && !note}
                  data-state={presented.status}
                  data-upgrade={upgrade ? 'true' : undefined}
                  onClick={() => onSelect(select)}
                >
                  <Icon className={styles.icon} size={19} aria-hidden="true" />
                  <span className={styles.name}>
                    {name}
                    <small>{note ? note : level > 0 ? `مستوى ${number(level)}` : 'لم يُبنَ'}</small>
                  </span>
                  <span id={`${id}-${entry.id}`} className={styles.state}>
                    {note ? 'تابع للسور' : buildingStatusLabels[presented.status]}
                    {upgrade ? ' · قابل للترقية' : ''}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </nav>
  );
}
