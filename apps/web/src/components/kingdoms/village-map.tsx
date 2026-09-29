'use client';

import Image from 'next/image';
import {
  Castle,
  Coins,
  Crown,
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
import { buildingStage, maxLevelLabel, supremeStage } from '@/lib/kingdoms/stages';
import { buildingKeys, type Building } from '@/lib/kingdoms/types';
import { BuildingActivity } from './building-activity';
import { number, type GameProps } from './shared';
import styles from './village.module.css';

export const plots = {
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
  const built = buildingKeys.filter((key) => village.buildings[key] > 0).length;
  const constructing = village.build ? view.config.buildings[village.build.building].name : null;
  return (
    <section className={styles.map} aria-label="خريطة القرية">
      <header className={styles.mapHead}>
        <div>
          <h3>مخطط القرية</h3>
          <p className={styles.mapSummary}>
            {number(built)} من {number(buildingKeys.length)} مبنى قائم · اختر مبنى لتطويره
          </p>
        </div>
        {constructing && (
          <span className={styles.tag} data-tone="live">
            قيد التطوير: {constructing}
          </span>
        )}
      </header>
      <div className={styles.mapFrame}>
        <div
          className={styles.mapViewport}
          tabIndex={0}
          aria-label="مخطط مباني القرية، قابل للتمرير أفقيًا"
        >
          <div className={styles.scene}>
            <Image
              src="/game-art/kingdoms/village-oasis.webp"
              alt=""
              fill
              sizes="(max-width: 700px) 760px, 1200px"
              className={styles.art}
              priority
            />
            <span className={styles.veil} aria-hidden="true" />
            <span className={styles.ground} aria-hidden="true" />
            <span className={styles.survey} aria-hidden="true" />
            <span className={styles.plateFrame} aria-hidden="true" />
            {buildingKeys.map((building) => {
              const plot = plots[building];
              const level = village.buildings[building];
              const maxLevel = view.config.buildings[building].maxLevel;
              const name = view.config.buildings[building].name;
              const stage = buildingStage(level, maxLevel);
              const topStage = stage?.key === supremeStage.key;
              const busy = village.build?.building === building;
              const percent = level > 0 ? Math.min(100, Math.round((level / maxLevel) * 100)) : 0;
              const state = busy
                ? 'قيد التطوير'
                : level > 0
                  ? `المستوى ${number(level)} من ${number(maxLevel)}`
                  : 'لم يُبنَ';
              const ariaLabel = [
                name,
                state,
                topStage && stage ? stage.name : null,
                level >= maxLevel ? maxLevelLabel : null,
              ]
                .filter(Boolean)
                .join('، ');
              return (
                <button
                  type="button"
                  key={building}
                  className={styles.plot}
                  style={{ left: `${plot.x}%`, top: `${plot.y}%` }}
                  data-built={level > 0}
                  data-constructing={busy}
                  data-stage={stage?.key ?? 'unbuilt'}
                  aria-pressed={selected === building}
                  aria-label={ariaLabel}
                  onClick={() => onSelect(building)}
                >
                  <span className={styles.medallion}>
                    <plot.Icon size={18} aria-hidden="true" />
                  </span>
                  <span className={styles.plate}>
                    <span className={styles.plateName}>
                      {name}
                      {topStage && <Crown size={13} aria-hidden="true" />}
                      {busy && <Hammer size={13} aria-hidden="true" />}
                    </span>
                    <span className={styles.plateMeta}>
                      <span className={styles.plotLevel}>
                        {level > 0 ? `${number(level)}/${number(maxLevel)}` : 'لم يُبنَ'}
                      </span>
                      {percent > 0 && (
                        <span className={`${styles.bar} ${styles.plotBar}`} aria-hidden="true">
                          <span style={{ width: `${percent}%` }} />
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {buildingKeys.map((building) => {
              const level = village.buildings[building];
              const maxLevel = view.config.buildings[building].maxLevel;
              const stage = buildingStage(level, maxLevel);
              return (
                <BuildingActivity
                  key={`${view.worldId}:${village.id}:${building}`}
                  name={view.config.buildings[building].name}
                  level={level}
                  stageName={stage?.key === supremeStage.key ? stage.name : undefined}
                  atMaxLevel={level >= maxLevel}
                  build={village.build?.building === building ? village.build : undefined}
                  serverNow={view.serverNow}
                  x={plots[building].x}
                  y={plots[building].y}
                />
              );
            })}
          </div>
        </div>
      </div>
      <ul className={styles.legend} aria-label="دلالات أرض القرية">
        <li>
          <span className={styles.legendMark} data-state="built" aria-hidden="true" />
          مبني
        </li>
        <li>
          <span className={styles.legendMark} data-state="building" aria-hidden="true" />
          قيد التطوير
        </li>
        <li>
          <span className={styles.legendMark} data-state="empty" aria-hidden="true" />
          أرض شاغرة
        </li>
        <li>
          <span className={styles.legendMark} data-state="supreme" aria-hidden="true" />
          {supremeStage.name}
        </li>
      </ul>
      <div className={styles.mapFooter}>
        <p>اسحب المشهد أفقيًا على الجوال، أو اختر مبنى من القائمة.</p>
        <div className={styles.mapSelect}>
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
      </div>
    </section>
  );
}
