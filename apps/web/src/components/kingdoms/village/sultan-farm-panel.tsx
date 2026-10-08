'use client';

import { useContext, useState, useSyncExternalStore } from 'react';
import { Sprout, Wheat, Timer, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui';
import {
  cropKeys,
  farmCrops,
  farmGrowth,
  farmQuote,
  farmStageNames,
  farmState,
  type CropKey,
  type FarmPlant,
} from '@/lib/kingdoms/sultan-farm';
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

/** An original, lightweight growth illustration; the main scene uses the calibrated photographic projection. */
export function FarmPlantVisual({
  plant,
  now,
  detail = true,
}: {
  plant?: FarmPlant;
  now: number;
  detail?: boolean;
}) {
  const growth = plant ? farmGrowth(plant, now) : null;
  const height = growth ? 0.18 + 0.82 * growth.progress : 0;
  return (
    <svg
      className={styles.visual}
      viewBox="0 0 120 96"
      aria-hidden="true"
      data-crop={plant?.crop ?? 'empty'}
      data-stage={growth?.stage ?? 'empty'}
    >
      <ellipse cx="60" cy="81" rx="48" ry="10" className={styles.soil} />
      <path d="M17 82 Q60 92 103 82 M30 76 Q60 85 90 76" className={styles.furrow} />
      {!plant ? (
        <path d="M52 80h16m-8-8v16" className={styles.emptyMark} />
      ) : growth?.stage === 'seed' ? (
        <ellipse cx="60" cy="78" rx="3" ry="2" className={styles.seed} />
      ) : (
        <g style={{ transform: `translate(60px,80px) scale(1,${height})` }}>
          <g className={styles.canopy}>
            <path
              d="M0 0 Q-4-22 0-54 M0-16 Q-26-18-19-33 Q-2-31 0-16 M0-30 Q22-29 20-43 Q5-44 0-30"
              className={styles.stem}
            />
            {plant.crop === 'wheat' ? (
              <g className={styles.grain}>
                {[0, 1, 2, 3, 4].slice(0, detail ? 5 : 3).map((i) => (
                  <path key={i} d={`M0 ${-46 - i * 5}q-11-2-8-7q8 0 8 7q11-2 8-7q-8 0-8 7`} />
                ))}
              </g>
            ) : (
              <path
                d="M0-48 Q-23-46-18-60 Q-7-64 0-48 Q8-67 24-56 Q25-44 0-48"
                className={styles.leaves}
              />
            )}
            {growth && growth.progress >= 0.75 && plant.crop !== 'wheat' && (
              <g className={styles.fruit}>
                {plant.crop === 'beans' ? (
                  <>
                    <path d="M-15-38q-8 15-2 20q8-10 2-20M15-47q8 13 3 19q-7-6-3-19" />
                    {detail && <path d="M-7-53q-5 12 1 18q5-9-1-18" />}
                  </>
                ) : (
                  <>
                    <circle cx="-15" cy="-39" r="6" />
                    <circle cx="17" cy="-49" r="6" />
                    {detail && <circle cx="-7" cy="-56" r="5" />}
                  </>
                )}
              </g>
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
    plot = farm.plots[selected];
  const deadline = Math.max(view.serverNow, ...farm.plots.map((item) => item.plant?.readyAt ?? 0));
  const now = useViewClock(view, deadline, `farm:${view.worldId}:${village.id}`);
  const motion = useSyncExternalStore(subscribeEnvironment, environment, fallbackEnvironment);
  const detail = !motion.endsWith(':low');
  const growth = plot.plant ? farmGrowth(plot.plant, now) : null;
  const level = village.buildings.farm;
  let quote: ReturnType<typeof farmQuote> | null = null;
  try {
    quote = farmQuote(view.config, level, seed, plot.previousFamily);
  } catch {
    /* A disabled custom economy cannot quote a viable seed. */
  }
  const full = Boolean(
    plot.plant &&
    village.resources.food + plot.plant.harvestFood > storageCapacity(view.config, village),
  );
  const locked = level < farmCrops[seed].minLevel;
  const shortage = Boolean(quote && village.resources.food < quote.seedFood);
  const disabled = busy || view.paused || view.season.status === 'ended';
  const ready = farm.plots.filter(
    (item) => item.plant && farmGrowth(item.plant, now).stage === 'ripe',
  ).length;
  return (
    <section
      className={styles.farm}
      dir="rtl"
      aria-label="أحواض مزرعة السلطان"
      data-farm-motion={view.paused || scene?.motionPaused || motion.startsWith('quiet') ? 'quiet' : 'moving'}
      data-farm-quality={motion.split(':')[1]}
    >
      <header className={styles.heading}>
        <div>
          <p>من البذرة إلى الحصاد</p>
          <h3>أحواض السلطان</h3>
        </div>
        <Sprout size={28} aria-hidden="true" />
      </header>
      <div className={styles.summary}>
        <span>
          مستوى المزرعة <bdi>{number(level)}</bdi>
        </span>
        <span>
          <bdi>{number(ready)}</bdi> جاهز للحصاد
        </span>
      </div>
      <p className={styles.hint}>
        اختر حوضًا، ثم بذرة. يستمر النمو أثناء غيابك؛ المحصول الناضج ينتظرك.
      </p>
      <div className={styles.plots} role="group" aria-label="اختيار الحوض">
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
          <FarmPlantVisual plant={plot.plant} now={now} detail={detail} />
          <div>
            <h4>
              الحوض <bdi>{number(selected + 1)}</bdi>
            </h4>
            <p>{plot.plant ? farmCrops[plot.plant.crop].name : 'جاهز لبذرة جديدة'}</p>
          </div>
        </div>
        {plot.plant && growth ? (
          <>
            <div className={styles.stage}>
              <strong>{farmStageNames[growth.stage]}</strong>
              <span>
                {growth.remainingMs
                  ? `متبقٍ ${farmDuration(growth.remainingMs)}`
                  : 'حان وقت الحصاد'}
              </span>
            </div>
            <progress
              className={styles.progress}
              value={growth.progress}
              max={1}
              aria-label="تقدم نمو المحصول"
            />
            <p className={styles.reward}>
              <Wheat size={18} aria-hidden="true" />
              عائد الحصاد <bdi>{farmAmount(plot.plant.harvestFood)}</bdi> غذاء للقرية
            </p>
            {plot.plant.rotated && (
              <p className={styles.rotation}>تناوب المحاصيل: مدة نمو أقصر بنسبة ٥٪</p>
            )}
            {full && (
              <p role="status" className={styles.storage}>
                <Warehouse size={18} aria-hidden="true" />
                المخزن لا يتسع للمحصول. أفرغ مساحة أو طوّر المخزن؛ يبقى المحصول محفوظًا.
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
              حصاد الحوض {number(selected + 1)}
            </Button>
          </>
        ) : (
          <>
            <fieldset className={styles.seeds}>
              <legend>اختر البذرة</legend>
              {cropKeys.map((crop) => (
                <button
                  type="button"
                  key={crop}
                  className={styles.seedOption}
                  aria-pressed={seed === crop}
                  disabled={level < farmCrops[crop].minLevel}
                  onClick={() => setSeed(crop)}
                >
                  <span>{farmCrops[crop].name}</span>
                  <small>
                    {level < farmCrops[crop].minLevel
                      ? `يفتح في المستوى ${number(farmCrops[crop].minLevel)}`
                      : 'متاح'}
                  </small>
                </button>
              ))}
            </fieldset>
            {quote ? (
              <dl className={styles.quote}>
                <div>
                  <dt>
                    <Timer size={16} aria-hidden="true" />
                    مدة النمو
                  </dt>
                  <dd>{farmDuration(quote.growMs)}</dd>
                </div>
                <div>
                  <dt>تكلفة البذرة</dt>
                  <dd>
                    <bdi>{farmAmount(quote.seedFood)}</bdi> غذاء
                  </dd>
                </div>
                <div>
                  <dt>عائد الحصاد</dt>
                  <dd>
                    <bdi>{farmAmount(quote.harvestFood)}</bdi> غذاء
                  </dd>
                </div>
              </dl>
            ) : (
              <p role="status">إعدادات العالم لا تتيح هذا المحصول حاليًا.</p>
            )}
            {quote?.rotated && (
              <p className={styles.rotation}>
                اختيار عائلة مختلفة يمنح نموًا أسرع بنسبة ٥٪ لهذه الزرعة.
              </p>
            )}
            {shortage && <p className={styles.storage}>غذاء القرية غير كافٍ لهذه البذرة.</p>}
            <Button
              disabled={disabled || locked || shortage || !quote}
              onClick={() =>
                void send({
                  type: 'farmPlant',
                  villageId: village.id,
                  plotId: selected,
                  expectedVersion: plot.version,
                  crop: seed,
                  expectedQuote: quote!.quoteKey,
                })
              }
            >
              زرع {farmCrops[seed].name}
            </Button>
          </>
        )}
      </div>
      <p className={styles.footnote}>
        تغيير عائلة المحصول بعد حصاده يقلل مدة الزرعة التالية ٥٪. لا يذبل المحصول عند الغياب.
      </p>
    </section>
  );
}
