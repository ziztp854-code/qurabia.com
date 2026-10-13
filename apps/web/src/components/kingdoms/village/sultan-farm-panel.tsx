'use client';

import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Sprout, Timer, Warehouse, Award } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  cropKeys,
  farmCrops,
  farmGrowth,
  farmQuote,
  farmStageNames,
  farmState,
  gardenProgress,
  gardenGoals,
  gardenHarvestPreview,
  gardenStyles,
  gardenStyleKeys,
  type CropKey,
  type FarmPlant,
} from '@/lib/kingdoms/sultan-farm';
import { farmPlantAsset, farmVisualStage } from '@/lib/kingdoms/village/farm-plant-visual';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { number, rateAmount, type GameProps } from '../shared';
import { useViewClock } from '../use-view-clock';
import styles from './sultan-farm-panel.module.css';
import { sultanFarmCopy as copy } from './sultan-farm-copy';
import { FarmSceneContext } from './farm-scene-context';

const farmAmount = (value: number) => value.toLocaleString('ar-SA', { maximumFractionDigits: 3 });
const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeEnvironment(listener: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener('change', listener);
  document.addEventListener('visibilitychange', listener);
  window.addEventListener('resize', listener);
  return () => {
    query.removeEventListener('change', listener);
    document.removeEventListener('visibilitychange', listener);
    window.removeEventListener('resize', listener);
  };
}
function environment() {
  const device = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  const quality = resolveVillageQuality('auto', {
    width: window.innerWidth,
    memory: device.deviceMemory,
    cores: device.hardwareConcurrency,
    saveData: device.connection?.saveData,
  });
  return `${document.hidden || window.matchMedia(motionQuery).matches ? 'quiet' : 'moving'}:${quality.mode}`;
}
const fallbackEnvironment = () => 'quiet:low';
export function farmDuration(ms: number) {
  const minutes = Math.ceil(ms / 60000);
  return minutes >= 60
    ? copy.duration.hours(rateAmount(minutes / 60))
    : copy.duration.minutes(number(minutes));
}
const growthStageKeys = ['seed', 'sprout', 'growing', 'fruiting', 'ripe'] as const;
export function FarmPlantVisual({
  plant,
  now,
  detail = true,
  previewCrop,
}: {
  plant?: FarmPlant;
  previewCrop?: CropKey;
  now: number;
  detail?: boolean;
}) {
  const growth = plant ? farmGrowth(plant, now) : null;
  const crop = plant?.crop ?? previewCrop;
  const stage = growth?.stage ?? (previewCrop ? 'preview' : 'empty');
  const asset =
    crop && stage !== 'seed' && stage !== 'empty'
      ? farmPlantAsset(crop, farmVisualStage(stage))
      : null;
  return (
    <svg
      className={styles.visual}
      viewBox="0 0 120 96"
      aria-hidden="true"
      data-crop={crop ?? 'empty'}
      data-stage={stage}
      data-detail={detail}
    >
      <ellipse cx="60" cy="81" rx="48" ry="10" className={styles.soil} />
      <path d="M17 82 Q60 92 103 82 M30 76 Q60 85 90 76" className={styles.furrow} />
      {!crop ? (
        <path d="M52 80h16m-8-8v16" className={styles.emptyMark} />
      ) : growth?.stage === 'seed' ? (
        <ellipse cx="60" cy="78" rx="3" ry="2" className={styles.seed} />
      ) : asset ? (
        <g
          className={styles.canopyScale}
          transform={`translate(60 82) scale(${0.45 + 0.55 * (growth?.progress ?? 1)}) translate(-60 -82)`}
        >
          <g className={styles.canopy}>
            <image
              href={asset}
              x="10"
              y="2"
              width="100"
              height="80"
              preserveAspectRatio="xMidYMax meet"
              className={styles.photoCanopy}
            />
          </g>
        </g>
      ) : null}
    </svg>
  );
}

export function SultanFarmPanel({ view, village, busy, send }: GameProps) {
  const [gameOpen, setGameOpen] = useState(false);
  const gameDialog = useRef<HTMLDialogElement>(null);
  const gameTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!gameOpen) return;
    const trigger = gameTrigger.current;
    gameDialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [gameOpen]);
  const [localSelected, setLocalSelected] = useState(0),
    [seed, setSeed] = useState<CropKey>('wheat');
  const scene = useContext(FarmSceneContext);
  const selected = scene?.selected ?? localSelected,
    setSelected = scene?.select ?? setLocalSelected;
  const farm = farmState(village),
    progress = gardenProgress(farm),
    plot = farm.plots[selected];
  const deadline = Math.max(view.serverNow, ...farm.plots.map((item) => item.plant?.readyAt ?? 0));
  const now = useViewClock(view, deadline, `farm:${view.worldId}:${village.id}`);
  const motion = useSyncExternalStore(subscribeEnvironment, environment, fallbackEnvironment);
  const growth = plot.plant ? farmGrowth(plot.plant, now) : null;
  const growthStageIndex = growth ? growthStageKeys.indexOf(growth.stage) : -1;
  const quote = farmQuote(view.config, village.buildings.farm, seed, plot.previousFamily);
  const legacy = plot.plant?.policyVersion === 1;
  const full = Boolean(
    legacy &&
    plot.plant &&
    village.resources.food + plot.plant.harvestFood > storageCapacity(view.config, village),
  );
  const locked = progress.harvests < farmCrops[seed].unlockHarvests;
  const disabled = busy || view.paused || view.season.status === 'ended';
  const counts = farm.plots.reduce(
    (total, item) => {
      if (!item.plant) return { ...total, empty: total.empty + 1 };
      if (farmGrowth(item.plant, now).stage === 'ripe') return { ...total, ready: total.ready + 1 };
      return { ...total, growing: total.growing + 1 };
    },
    { empty: 0, growing: 0, ready: 0 },
  );
  const preview = gardenHarvestPreview(farm, plot.plant?.crop ?? seed, view.player?.achievements);
  const reward = (
    <p className={styles.reward}>
      <Award size={18} aria-hidden="true" />
      <span>
        {copy.reward.preview(number(preview.harvests))}
        {preview.rewards.length > 0 && <strong> {preview.rewards.join('، ')}.</strong>}
      </span>
    </p>
  );
  return (
    <section
      className={styles.farm}
      dir="rtl"
      aria-label={copy.aria.farm}
      data-garden-style={progress.style}
      data-farm-motion={
        view.paused || scene?.motionPaused || motion.startsWith('quiet') ? 'quiet' : 'moving'
      }
      data-farm-quality={motion.split(':')[1]}
    >
      <header className={styles.heading}>
        <div>
          <p>{copy.header.eyebrow}</p>
          <h3>{copy.header.title}</h3>
          <span>{copy.header.intro}</span>
        </div>
        <span className={styles.headingMark} aria-hidden="true">
          <Sprout size={28} />
        </span>
      </header>
      <div className={styles.managementEntry}>
        <div>
          <strong>لعبة إدارة مزرعة السلطان</strong>
          <p>
            ازرع واحصد، شغّل الطاحونة والمخبز، وأرسل قوافل السوق. تقدم هذه اللعبة يُحفظ على جهازك
            ومكافآتها داخلها فقط.
          </p>
        </div>
        <Button ref={gameTrigger} variant="gold" fullWidth onClick={() => setGameOpen(true)}>
          افتح لعبة المزرعة
        </Button>
      </div>
      {gameOpen &&
        createPortal(
          <dialog
            ref={gameDialog}
            className={styles.managementDialog}
            aria-label="لعبة إدارة مزرعة السلطان"
            onKeyDown={(event) => event.stopPropagation()}
            onCancel={() => setGameOpen(false)}
            onClose={() => setGameOpen(false)}
          >
            <div className={styles.managementToolbar}>
              <strong>مزرعة السلطان · الزراعة والتصنيع والقوافل</strong>
              <Button variant="ghost" onClick={() => setGameOpen(false)}>
                العودة إلى المزرعة
              </Button>
            </div>
            <iframe
              className={styles.managementFrame}
              title="لعبة إدارة مزرعة السلطان"
              src={`/games/sultan-farm/index.html?save=${encodeURIComponent(JSON.stringify([view.worldId, village.ownerId, village.id]))}`}
            />
          </dialog>,
          document.body,
        )}
      <div className={styles.summary} aria-label={copy.aria.summary}>
        <span>{copy.header.harvests(number(progress.harvests))}</span>
        <span>{copy.header.growing(number(counts.growing))}</span>
        <span data-ready={counts.ready > 0}>{copy.header.ripe(number(counts.ready))}</span>
        <span>{copy.header.empty(number(counts.empty))}</span>
      </div>
      <p className={styles.hint}>{copy.guidance}</p>
      <div className={styles.plots} role="group" aria-label={copy.aria.plots}>
        {farm.plots.map((item, index) => {
          const state = item.plant ? farmGrowth(item.plant, now) : null;
          const plotState = item.plant
            ? `${farmCrops[item.plant.crop].name}، ${farmStageNames[state!.stage]}`
            : copy.plot.empty;
          return (
            <button
              key={index}
              type="button"
              className={styles.plot}
              aria-pressed={selected === index}
              data-ready={state?.stage === 'ripe'}
              data-legacy={item.plant?.policyVersion === 1}
              aria-label={copy.aria.plot(String(index + 1), plotState)}
              onClick={() => setSelected(index)}
            >
              <span className={styles.plotNumber}>
                <bdi>{number(index + 1)}</bdi>
              </span>
              <span className={styles.plotVisual}>
                <FarmPlantVisual plant={item.plant} now={now} detail={false} />
              </span>
              <span className={styles.plotMeta}>
                <strong>{item.plant ? farmCrops[item.plant.crop].name : copy.plot.empty}</strong>
                <small>
                  {state
                    ? state.stage === 'ripe'
                      ? copy.plot.ready
                      : `${farmStageNames[state.stage]} · ${copy.plot.remaining(farmDuration(state.remainingMs))}`
                    : copy.plot.freeCosmetic}
                </small>
              </span>
              {item.plant?.policyVersion === 1 && (
                <span className={styles.legacyTag}>{copy.plot.legacy}</span>
              )}
              {state && state.stage !== 'ripe' && (
                <span className={styles.plotProgress} aria-hidden="true">
                  <i style={{ '--plot-progress': `${state.progress * 100}%` } as CSSProperties} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className={styles.selected} aria-label={copy.aria.details(String(selected + 1))}>
        <div className={styles.preview}>
          <FarmPlantVisual
            plant={plot.plant}
            previewCrop={plot.plant ? undefined : seed}
            now={now}
            detail={!motion.endsWith(':low')}
          />
          <div>
            <span className={styles.detailEyebrow}>{copy.detail.eyebrow}</span>
            <h4>{copy.detail.title(number(selected + 1))}</h4>
            <p>
              {plot.plant
                ? farmCrops[plot.plant.crop].name
                : copy.detail.maturePreview(farmCrops[seed].name)}
            </p>
          </div>
        </div>
        {plot.plant && growth ? (
          <>
            <div className={styles.stage}>
              <strong>{farmStageNames[growth.stage]}</strong>
              <span>
                {growth.remainingMs
                  ? copy.plot.remaining(farmDuration(growth.remainingMs))
                  : copy.plot.ready}
              </span>
            </div>
            <ol className={styles.stageTrack} aria-label={copy.aria.growth}>
              {growthStageKeys.map((stage, index) => {
                return (
                  <li
                    key={stage}
                    data-complete={index < growthStageIndex}
                    aria-current={stage === growth.stage ? 'step' : undefined}
                  >
                    <i aria-hidden="true" />
                    <span>{farmStageNames[stage]}</span>
                  </li>
                );
              })}
            </ol>
            <progress
              className={styles.progress}
              value={growth.progress}
              max={1}
              aria-label={copy.aria.progress}
            />
            {legacy ? (
              <p className={styles.reward}>
                {copy.reward.legacy(farmAmount(plot.plant.harvestFood))}
              </p>
            ) : (
              reward
            )}
            {full && (
              <p role="status" className={styles.storage}>
                <Warehouse size={18} aria-hidden="true" />
                {copy.reward.storageFull}
              </p>
            )}
            <Button
              variant="gold"
              fullWidth
              loading={busy}
              disabled={disabled || growth.stage !== 'ripe' || full}
              onClick={() =>
                void send({
                  type: 'farmHarvest',
                  villageId: village.id,
                  plotId: selected,
                  expectedVersion: plot.version,
                })
              }
            >
              {legacy
                ? copy.actions.legacyHarvest(number(selected + 1))
                : copy.actions.collect(number(selected + 1))}
            </Button>
          </>
        ) : (
          <>
            <fieldset className={styles.seeds}>
              <legend>{copy.picker.legend}</legend>
              {cropKeys.map((crop) => {
                const remaining = Math.max(0, farmCrops[crop].unlockHarvests - progress.harvests);
                return (
                  <button
                    type="button"
                    key={crop}
                    className={styles.seedOption}
                    aria-pressed={seed === crop}
                    aria-disabled={remaining > 0}
                    onClick={() => setSeed(crop)}
                  >
                    <span>{farmCrops[crop].name}</span>
                    <small>
                      {remaining > 0
                        ? copy.picker.locked(number(remaining))
                        : copy.picker.available}
                    </small>
                  </button>
                );
              })}
            </fieldset>
            <dl className={styles.quote}>
              <div>
                <dt>
                  <Timer size={16} aria-hidden="true" />
                  {copy.picker.duration}
                </dt>
                <dd>{farmDuration(quote.growMs)}</dd>
              </div>
              <div>
                <dt>{copy.picker.cycle}</dt>
                <dd>{copy.picker.cycleValue}</dd>
              </div>
            </dl>
            {reward}
            {locked && (
              <p role="status" className={styles.hint}>
                {copy.picker.unlock(
                  farmCrops[seed].name,
                  number(progress.harvests),
                  number(farmCrops[seed].unlockHarvests),
                  number(farmCrops[seed].unlockHarvests - progress.harvests),
                )}
              </p>
            )}
            <Button
              variant="gold"
              fullWidth
              loading={busy}
              disabled={disabled || locked}
              onClick={() =>
                void send({
                  type: 'farmPlant',
                  villageId: village.id,
                  plotId: selected,
                  expectedVersion: plot.version,
                  crop: seed,
                  expectedQuote: quote.quoteKey,
                })
              }
            >
              {copy.actions.plant(farmCrops[seed].name)}
            </Button>
          </>
        )}
      </div>
      <details className={styles.goals}>
        <summary>
          <Award size={18} aria-hidden="true" />
          {copy.goals.summary}
        </summary>
        <ul>
          {gardenGoals(farm).map((goal) => (
            <li key={goal.id} data-earned={view.player?.achievements.includes(goal.id)}>
              <strong>
                {goal.name}
                {view.player?.achievements.includes(goal.id) ? copy.goals.earnedSuffix : ''}
              </strong>
              <span>
                {view.player?.achievements.includes(goal.id)
                  ? copy.goals.earned
                  : copy.goals.progress(
                      number(Math.min(goal.value, goal.target)),
                      number(goal.target),
                      goal.metric === 'variety' ? copy.goals.varietyUnit : copy.goals.harvestUnit,
                      number(goal.remaining),
                    )}
              </span>
              <small>{copy.goals.reward(goal.reward)}</small>
            </li>
          ))}
        </ul>
      </details>
      <fieldset className={`${styles.seeds} ${styles.decor}`}>
        <legend>{copy.decor.legend}</legend>
        {gardenStyleKeys.map((style) => {
          const remaining = Math.max(0, gardenStyles[style].unlockHarvests - progress.harvests);
          return (
            <button
              key={style}
              type="button"
              className={styles.seedOption}
              aria-pressed={progress.style === style}
              disabled={disabled || remaining > 0}
              onClick={() => void send({ type: 'farmStyle', villageId: village.id, style })}
            >
              <span>{gardenStyles[style].name}</span>
              <small>
                {remaining
                  ? copy.decor.locked(number(remaining))
                  : progress.style === style
                    ? copy.decor.applied
                    : copy.decor.apply}
              </small>
            </button>
          );
        })}
      </fieldset>
      <p className={styles.footnote}>{copy.footnote}</p>
    </section>
  );
}
