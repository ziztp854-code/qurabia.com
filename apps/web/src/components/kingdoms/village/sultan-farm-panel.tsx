'use client';

import { useContext, useState, useSyncExternalStore, type CSSProperties } from 'react';
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
import { farmPlantShapes } from '@/lib/kingdoms/village/farm-plant-shapes';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { number, rateAmount, type GameProps } from '../shared';
import { useViewClock } from '../use-view-clock';
import styles from './sultan-farm-panel.module.css';
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
  return minutes >= 60 ? `${rateAmount(minutes / 60)} ساعة` : `${number(minutes)} دقيقة`;
}
const bloomTokens = {
  gold: '--kingdoms-ui-gold',
  green: '--kingdoms-ui-success',
  red: '--kingdoms-ui-danger',
  ivory: '--brand-ivory',
  violet: '--kingdoms-garden-violet',
} as const;
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
  const shapes = crop ? farmPlantShapes(crop, growth?.progress ?? 1) : [];
  const color = crop ? `var(${bloomTokens[farmCrops[crop].color]})` : 'currentColor';
  return (
    <svg
      className={styles.visual}
      viewBox="0 0 120 96"
      aria-hidden="true"
      data-crop={crop ?? 'empty'}
      data-stage={growth?.stage ?? (previewCrop ? 'preview' : 'empty')}
      data-detail={detail}
      style={{ '--garden-bloom': color } as CSSProperties}
    >
      <ellipse cx="60" cy="81" rx="48" ry="10" className={styles.soil} />
      <path d="M17 82 Q60 92 103 82 M30 76 Q60 85 90 76" className={styles.furrow} />
      {!crop ? (
        <path d="M52 80h16m-8-8v16" className={styles.emptyMark} />
      ) : growth?.stage === 'seed' ? (
        <ellipse cx="60" cy="78" rx="3" ry="2" className={styles.seed} />
      ) : (
        <g transform={`translate(60 80) scale(${0.35 + 0.65 * (growth?.progress ?? 1)})`}>
          <g className={styles.canopy}>
            {shapes.map((shape, i) =>
              shape.kind === 'line' ? (
                <line
                  key={i}
                  x1={shape.x1}
                  y1={shape.y1}
                  x2={shape.x2}
                  y2={shape.y2}
                  className={styles.artStem}
                />
              ) : (
                <ellipse
                  key={i}
                  cx={shape.x}
                  cy={shape.y}
                  rx={shape.rx}
                  ry={shape.ry}
                  transform={`rotate(${shape.angle} ${shape.x} ${shape.y})`}
                  className={
                    shape.paint === 'leaf'
                      ? styles.artLeaf
                      : shape.paint === 'center'
                        ? styles.artCenter
                        : styles.artBloom
                  }
                />
              ),
            )}
          </g>
        </g>
      )}
    </svg>
  );
}

export function SultanFarmPanel({ view, village, busy, send }: GameProps) {
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
  const quote = farmQuote(view.config, village.buildings.farm, seed, plot.previousFamily);
  const legacy = plot.plant?.policyVersion === 1;
  const full = Boolean(
    legacy &&
    plot.plant &&
    village.resources.food + plot.plant.harvestFood > storageCapacity(view.config, village),
  );
  const locked = progress.harvests < farmCrops[seed].unlockHarvests;
  const disabled = busy || view.paused || view.season.status === 'ended';
  const ready = farm.plots.filter(
    (item) => item.plant && farmGrowth(item.plant, now).stage === 'ripe',
  ).length;
  const preview = gardenHarvestPreview(farm, plot.plant?.crop ?? seed, view.player?.achievements);
  const reward = (
    <p className={styles.reward}>
      <Award size={18} aria-hidden="true" />
      <span>
        الجمع يمنح حصادًا واحدًا للحديقة؛ يصبح المجموع {number(preview.harvests)}.
        {preview.rewards.length > 0 && <strong> {preview.rewards.join('، ')}.</strong>}
      </span>
    </p>
  );
  return (
    <section
      className={styles.farm}
      dir="rtl"
      aria-label="مزرعة السلطان"
      data-garden-style={progress.style}
      data-farm-motion={
        view.paused || scene?.motionPaused || motion.startsWith('quiet') ? 'quiet' : 'moving'
      }
      data-farm-quality={motion.split(':')[1]}
    >
      <header className={styles.heading}>
        <div>
          <p>ازرع، شاهد النمو، واجمع الأوسمة</p>
          <h3>مزرعة السلطان</h3>
        </div>
        <Sprout size={28} aria-hidden="true" />
      </header>
      <div className={styles.summary}>
        <span>{number(progress.harvests)} حصاد تجميلي</span>
        <span>{number(ready)} جاهز للجمع</span>
      </div>
      <p className={styles.hint}>
        البذور مجانية وتتجدد بعد كل جمع. تنمو النباتات أثناء غيابك وتبقى ناضجة حتى تعود. المكافآت
        نباتات وأوسمة وزينة للحديقة.
      </p>
      <div className={styles.plots} role="group" aria-label="أحواض المزرعة">
        {farm.plots.map((item, index) => {
          const state = item.plant ? farmGrowth(item.plant, now) : null;
          return (
            <button
              key={index}
              type="button"
              className={styles.plot}
              aria-pressed={selected === index}
              data-ready={state?.stage === 'ripe'}
              aria-label={`الحوض ${index + 1}، ${item.plant ? farmCrops[item.plant.crop].name + '، ' + farmStageNames[state!.stage] : 'فارغ'}`}
              onClick={() => setSelected(index)}
            >
              <span className={styles.plotNumber}>
                <bdi>{number(index + 1)}</bdi>
              </span>
              <FarmPlantVisual plant={item.plant} now={now} detail={false} />
              <span>{state ? farmStageNames[state.stage] : 'فارغ'}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.selected} aria-label={`تفاصيل الحوض ${selected + 1}`}>
        <div className={styles.preview}>
          <FarmPlantVisual
            plant={plot.plant}
            previewCrop={plot.plant ? undefined : seed}
            now={now}
            detail={!motion.endsWith(':low')}
          />
          <div>
            <h4>
              الحوض <bdi>{number(selected + 1)}</bdi>
            </h4>
            <p>
              {plot.plant ? farmCrops[plot.plant.crop].name : `${farmCrops[seed].name} — شكل النضج`}
            </p>
          </div>
        </div>
        {plot.plant && growth ? (
          <>
            <div className={styles.stage}>
              <strong>{farmStageNames[growth.stage]}</strong>
              <span>
                {growth.remainingMs ? `متبقي ${farmDuration(growth.remainingMs)}` : 'جاهز للجمع'}
              </span>
            </div>
            <progress
              className={styles.progress}
              value={growth.progress}
              max={1}
              aria-label="تقدم نمو النبات"
            />
            {legacy ? (
              <p className={styles.reward}>
                محصول قديم مدفوع: {farmAmount(plot.plant.harvestFood)} غذاء عند الحصاد وفق العقد
                المحفوظ. الزراعة التالية مجانية وتجميلية.
              </p>
            ) : (
              reward
            )}
            {full && (
              <p role="status" className={styles.storage}>
                <Warehouse size={18} aria-hidden="true" />
                المخزن لا يسع المحصول القديم؛ وفر مساحة، والمحصول محفوظ.
              </p>
            )}
            <Button
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
              {legacy ? 'احصد' : 'اجمع'} الحوض {number(selected + 1)}
            </Button>
          </>
        ) : (
          <>
            <fieldset className={styles.seeds}>
              <legend>اختر النبات — البذور مجانية</legend>
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
                      {remaining > 0 ? `متبقي ${number(remaining)} حصاد لفتحه` : 'متاح مجانًا'}
                    </small>
                  </button>
                );
              })}
            </fieldset>
            <dl className={styles.quote}>
              <div>
                <dt>
                  <Timer size={16} aria-hidden="true" />
                  مدة النمو
                </dt>
                <dd>{farmDuration(quote.growMs)}</dd>
              </div>
              <div>
                <dt>دورة البذور</dt>
                <dd>مجانية بعد كل جمع</dd>
              </div>
            </dl>
            {reward}
            {locked && (
              <p role="status" className={styles.hint}>
                لفتح {farmCrops[seed].name}: المكتسب {number(progress.harvests)} من{' '}
                {number(farmCrops[seed].unlockHarvests)} حصاد؛ المتبقي{' '}
                {number(farmCrops[seed].unlockHarvests - progress.harvests)}.
              </p>
            )}
            <Button
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
              ازرع {farmCrops[seed].name}
            </Button>
          </>
        )}
      </div>
      <details className={styles.goals}>
        <summary>
          <Award size={18} aria-hidden="true" />
          أوسمة الحديقة — المكتسب والأهداف
        </summary>
        <ul>
          {gardenGoals(farm).map((goal) => (
            <li key={goal.id} data-earned={view.player?.achievements.includes(goal.id)}>
              <strong>
                {goal.name}
                {view.player?.achievements.includes(goal.id) ? ' — مكتسب' : ''}
              </strong>
              <span>
                {view.player?.achievements.includes(goal.id)
                  ? 'وسام مكتسب لحسابك'
                  : `${number(Math.min(goal.value, goal.target))} / ${number(goal.target)} ${goal.metric === 'variety' ? 'أنواع مختلفة' : 'حصادات'}؛ متبقي ${number(goal.remaining)}`}
              </span>
              <small>المكافأة: {goal.reward}</small>
            </li>
          ))}
        </ul>
      </details>
      <fieldset className={styles.seeds}>
        <legend>زينة الأحواض</legend>
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
                  ? `متبقي ${number(remaining)} حصاد`
                  : progress.style === style
                    ? 'مطبّق'
                    : 'طبّق مجانًا'}
              </small>
            </button>
          );
        })}
      </fieldset>
      <p className={styles.footnote}>
        بذرة ← برعم ← نمو ← إزهار ← نضج. كل جمع يقدّم الحديقة فقط؛ إنتاج الغذاء من مبنى المزرعة
        يستمر كالمعتاد.
      </p>
    </section>
  );
}
