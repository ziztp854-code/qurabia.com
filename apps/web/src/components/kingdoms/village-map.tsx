'use client';

import Image from 'next/image';
import { Crown, Eye, EyeOff, Hammer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Select } from '@/components/ui';
import { buildingStage, maxLevelLabel, supremeStage } from '@/lib/kingdoms/stages';
import { buildingKeys, type Building } from '@/lib/kingdoms/types';
import { BuildingActivity } from './building-activity';
import { ArtCrop } from './building-portrait';
import { number, type GameProps } from './shared';
import {
  boundsOf,
  clipPolygon,
  hitBox,
  pathOf,
  plotCenter,
  plotState,
  relativeBox,
  sceneBox,
  villageArt,
  villagePlots,
  type PlotState,
} from './village-layout';
import styles from './village.module.css';

/** أيقونة كل مبنى وموضع مركزه في المشهد بالنسبة المئوية. */
export const plots = Object.fromEntries(
  buildingKeys.map((key) => [key, { ...plotCenter(key), Icon: villagePlots[key].Icon }]),
) as Record<Building, { x: number; y: number; Icon: (typeof villagePlots)[Building]['Icon'] }>;

function stateText(state: PlotState) {
  if (state.constructing) {
    return state.level > 0
      ? `قيد التطوير من المستوى ${number(state.level)} إلى ${number(state.targetLevel ?? state.level + 1)}`
      : 'قيد التطوير، يُبنى المستوى الأول';
  }
  return state.level > 0
    ? `المستوى ${number(state.level)} من ${number(state.maxLevel)}`
    : 'لم يُبنَ، أرض شاغرة';
}

function LevelRing({ percent, Icon }: { percent: number; Icon: PlotIcon }) {
  return (
    <span className={styles.ring}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className={styles.ringTrack} cx="18" cy="18" r="15.5" pathLength={100} />
        <circle
          className={styles.ringFill}
          cx="18"
          cy="18"
          r="15.5"
          pathLength={100}
          strokeDasharray={`${percent} 100`}
        />
      </svg>
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}
type PlotIcon = (typeof villagePlots)[Building]['Icon'];

export function VillageMap({
  view,
  village,
  selected,
  onSelect,
}: Pick<GameProps, 'view' | 'village'> & {
  selected: Building;
  onSelect: (building: Building) => void;
}) {
  const [labelsShown, setLabelsShown] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const built = buildingKeys.filter((key) => village.buildings[key] > 0).length;
  const constructing = village.build ? view.config.buildings[village.build.building].name : null;
  const selectedOutline = villagePlots[selected].outline;

  useEffect(() => {
    const frame = viewport.current;
    if (!frame || frame.scrollWidth <= frame.clientWidth + 1) return;
    const center = (plotCenter(selected).x / 100) * frame.scrollWidth;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    frame.scrollTo?.({
      left: Math.max(0, center - frame.clientWidth / 2),
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, [selected]);

  return (
    <section className={styles.map} aria-label="خريطة القرية">
      <header className={styles.mapHead}>
        <div>
          <h3>واحة القرية</h3>
          <p className={styles.mapSummary}>
            {number(built)} من {number(buildingKeys.length)} مبنى قائم · اختر مبنى لتطويره
          </p>
        </div>
        <div className={styles.mapTools}>
          {constructing && (
            <span className={styles.tag} data-tone="live">
              قيد التطوير: {constructing}
            </span>
          )}
          <button
            type="button"
            className={styles.toolButton}
            aria-pressed={!labelsShown}
            onClick={() => setLabelsShown((shown) => !shown)}
          >
            {labelsShown ? (
              <EyeOff size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
            {labelsShown ? 'أخفِ اللافتات' : 'أظهر اللافتات'}
          </button>
        </div>
      </header>
      <div className={styles.mapFrame}>
        <div
          ref={viewport}
          className={styles.mapViewport}
          tabIndex={0}
          aria-label="مشهد مباني القرية، قابل للتمرير أفقيًا"
        >
          <div className={styles.scene} data-labels={labelsShown ? 'shown' : 'hidden'}>
            <Image
              src={villageArt.src}
              alt=""
              fill
              sizes={villageArt.sizes}
              className={styles.art}
              priority
            />
            <span className={styles.veil} aria-hidden="true" />
            <svg
              className={styles.spotlight}
              viewBox={`0 0 ${villageArt.width} ${villageArt.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <mask id={`village-spot-${village.id}`}>
                  <rect width={villageArt.width} height={villageArt.height} fill="white" />
                  <path d={pathOf(selectedOutline)} fill="black" />
                </mask>
              </defs>
              <rect
                width={villageArt.width}
                height={villageArt.height}
                mask={`url(#village-spot-${village.id})`}
              />
            </svg>
            {buildingKeys.map((building) => {
              const spec = view.config.buildings[building];
              const state = plotState(building, village, spec.maxLevel);
              const stage = buildingStage(state.level, state.maxLevel);
              const topStage = stage?.key === supremeStage.key;
              const hit = hitBox(building);
              const outline = villagePlots[building].outline;
              const shape = boundsOf(outline);
              const Icon = villagePlots[building].Icon;
              const isSelected = selected === building;
              const ariaLabel = [
                spec.name,
                stateText(state),
                topStage && stage ? stage.name : null,
                state.maxed ? maxLevelLabel : null,
              ]
                .filter(Boolean)
                .join('، ');
              return (
                <button
                  type="button"
                  key={building}
                  className={styles.plot}
                  style={sceneBox(hit)}
                  data-building={building}
                  data-visual={state.visual}
                  data-built={state.level > 0}
                  data-constructing={state.constructing}
                  data-maxed={state.maxed}
                  data-stage={stage?.key ?? 'unbuilt'}
                  aria-pressed={isSelected}
                  aria-label={ariaLabel}
                  onClick={() => onSelect(building)}
                >
                  <span
                    className={styles.lotArea}
                    style={relativeBox(shape, hit)}
                    aria-hidden="true"
                  >
                    {state.visual !== 'prosperity' && (
                      <span
                        className={styles.lot}
                        style={{ clipPath: clipPolygon(outline, shape) }}
                      >
                        <ArtCrop frame={shape} />
                      </span>
                    )}
                    <svg
                      className={styles.outline}
                      viewBox={`${shape.x} ${shape.y} ${shape.w} ${shape.h}`}
                      preserveAspectRatio="none"
                    >
                      <path className={styles.outlineGlow} d={pathOf(outline)} />
                      <path className={styles.outlineLine} d={pathOf(outline)} />
                    </svg>
                  </span>
                  <span className={styles.chip}>
                    <LevelRing percent={state.percent} Icon={Icon} />
                    <span className={styles.chipName}>{spec.name}</span>
                    <span className={styles.chipLevel}>
                      {state.constructing ? (
                        <>
                          <Hammer size={12} aria-hidden="true" />
                          {number(state.targetLevel ?? state.level + 1)}
                        </>
                      ) : state.level > 0 ? (
                        number(state.level)
                      ) : (
                        'شاغرة'
                      )}
                    </span>
                    {state.maxed ? (
                      <Crown className={styles.chipCrown} size={13} aria-hidden="true" />
                    ) : null}
                  </span>
                </button>
              );
            })}
            {buildingKeys.map((building) => {
              const level = village.buildings[building];
              const maxLevel = view.config.buildings[building].maxLevel;
              const stage = buildingStage(level, maxLevel);
              const center = plotCenter(building);
              return (
                <BuildingActivity
                  key={`${view.worldId}:${village.id}:${building}`}
                  name={view.config.buildings[building].name}
                  level={level}
                  stageName={stage?.key === supremeStage.key ? stage.name : undefined}
                  atMaxLevel={level >= maxLevel}
                  build={village.build?.building === building ? village.build : undefined}
                  serverNow={view.serverNow}
                  x={center.x}
                  y={center.y}
                />
              );
            })}
          </div>
        </div>
      </div>
      <ul className={styles.legend} aria-label="دلالات مشهد القرية">
        <li>
          <span className={styles.legendMark} data-state="vacant" aria-hidden="true" />
          أرض شاغرة باهتة
        </li>
        <li>
          <span className={styles.legendMark} data-state="growth" aria-hidden="true" />
          اللون يكتمل مع المراحل
        </li>
        <li>
          <span className={styles.legendMark} data-state="building" aria-hidden="true" />
          قيد البناء
        </li>
        <li>
          <span className={styles.legendMark} data-state="supreme" aria-hidden="true" />
          {supremeStage.name}
        </li>
        <li>
          <Crown size={13} className={styles.legendCrown} aria-hidden="true" />
          {maxLevelLabel}
        </li>
      </ul>
      <div className={styles.mapFooter}>
        <p>اسحب المشهد أفقيًا على الجوال، واضغط مبنى لاختياره، أو تنقّل بمفتاح Tab أو القائمة.</p>
        <div className={styles.mapSelect}>
          <Select
            label="اختر مبنى من الخريطة"
            value={selected}
            onChange={(event) => onSelect(event.target.value as Building)}
          >
            {buildingKeys.map((building) => (
              <option value={building} key={building}>
                {view.config.buildings[building].name} ·{' '}
                {village.buildings[building] > 0
                  ? `المستوى ${number(village.buildings[building])}`
                  : 'شاغرة'}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </section>
  );
}
