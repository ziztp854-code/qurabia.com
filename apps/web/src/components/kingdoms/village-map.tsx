'use client';

import Image from 'next/image';
import {
  Castle,
  Coins,
  Flag,
  Hammer,
  Mountain,
  Pickaxe,
  Shield,
  Store,
  Swords,
  Trees,
  Warehouse,
  Wheat,
} from 'lucide-react';
import { Select } from '@/components/ui';
import { buildingKeys, type Building } from '@/lib/kingdoms/types';
import { number, type GameProps } from './shared';
import styles from './kingdoms.module.css';

const plots = {
  hall: { x: 50, y: 34, Icon: Castle },
  lumber: { x: 61, y: 19, Icon: Trees },
  quarry: { x: 15, y: 35, Icon: Mountain },
  mine: { x: 26, y: 21, Icon: Pickaxe },
  farm: { x: 83, y: 34, Icon: Wheat },
  treasury: { x: 24, y: 66, Icon: Coins },
  warehouse: { x: 71, y: 48, Icon: Warehouse },
  barracks: { x: 29, y: 50, Icon: Swords },
  wall: { x: 49, y: 82, Icon: Shield },
  market: { x: 80, y: 67, Icon: Store },
  embassy: { x: 52, y: 62, Icon: Flag },
} satisfies Record<Building, { x: number; y: number; Icon: typeof Castle }>;

export function VillageMap({
  view,
  village,
  selected,
  onSelect,
}: Pick<GameProps, 'view' | 'village'> & {
  selected: Building;
  onSelect: (building: Building) => void;
}) {
  return (
    <section className={styles.villageMapSection} aria-label="خريطة القرية">
      <header className={styles.villageMapHeader}>
        <div>
          <p className={styles.eyebrow}>في قلب مملكتك</p>
          <h2>{village.name}</h2>
          <p className={styles.cost}>اختر مبنى للاطلاع على مستواه وتطويره.</p>
        </div>
        <span className={styles.villageCoordinates} dir="ltr">
          X {village.x} / Y {village.y}
        </span>
      </header>
      <div
        className={styles.villageViewport}
        tabIndex={0}
        aria-label="مخطط مباني القرية، قابل للتمرير أفقيًا"
      >
        <div className={styles.villageScene}>
          <Image
            src="/game-art/kingdoms/village-oasis.webp"
            alt=""
            fill
            sizes="(max-width: 700px) 760px, 1200px"
            className={styles.villageArtwork}
            priority
          />
          <div className={styles.villageShade} aria-hidden="true" />
          {buildingKeys.map((building) => {
            const plot = plots[building];
            const level = village.buildings[building];
            const name = view.config.buildings[building].name;
            const constructing = village.build?.building === building;
            const state = constructing
              ? 'قيد التطوير'
              : level > 0
                ? `المستوى ${number(level)}`
                : 'لم يُبنَ';
            return (
              <button
                type="button"
                key={building}
                className={styles.buildingPlot}
                style={{ left: `${plot.x}%`, top: `${plot.y}%` }}
                data-built={level > 0}
                data-constructing={constructing}
                aria-pressed={selected === building}
                aria-label={`${name}، ${state}`}
                onClick={() => onSelect(building)}
              >
                <span className={styles.plotLabel}>
                  <plot.Icon size={16} aria-hidden="true" />
                  <span>{name}</span>
                  {constructing && <Hammer size={14} aria-hidden="true" />}
                </span>
                <span className={styles.plotLevel}>{level > 0 ? number(level) : 'لم يُبنَ'}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.villageMapFooter}>
        <p className={styles.cost}>
          على الجوال، اسحب المشهد لرؤية بقية المباني أو اختر من القائمة.
        </p>
        <Select
          label="اختر مبنى من الخريطة"
          value={selected}
          onChange={(event) => onSelect(event.target.value as Building)}
        >
          {buildingKeys.map((building) => (
            <option value={building} key={building}>
              {view.config.buildings[building].name} · {number(village.buildings[building])}
            </option>
          ))}
        </Select>
      </div>
    </section>
  );
}
