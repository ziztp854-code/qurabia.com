'use client';
import { useCallback, useState } from 'react';
import type { KingdomsCommand } from '@/lib/kingdoms/commands';
import {
  resourceKeys,
  type KingdomsConfig,
  type KingdomReport,
  type Movement,
  type Village,
} from '@/lib/kingdoms/types';
import type { AbandonedVillageView } from '@/lib/kingdoms/abandoned-village-types';
import { abandonedLoot, abandonedResourceNames } from '@/lib/kingdoms/abandoned-villages';
import { gatherPreview } from '@/lib/kingdoms/resource-sites';
import { emptyTroops } from '@/lib/kingdoms/simulation';
import { ResourceIcon } from '../resource-icon';
import { AbandonedVillageMap, type AbandonedBasemap } from './AbandonedVillageMap';
import styles from './abandoned-preview.module.css';

export interface AbandonedPreviewData {
  worldId: string;
  actor: string;
  serverTime: number;
  revision: number;
  config: KingdomsConfig;
  sites: AbandonedVillageView[];
  origin: Village;
  movements: Movement[];
  reports: KingdomReport[];
}
interface Props {
  data: AbandonedPreviewData;
  basemap: AbandonedBasemap;
  onCommand: (command: KingdomsCommand) => Promise<void>;
  busy: boolean;
}
export function AbandonedVillagePreview({ data, basemap, onCommand, busy }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [guards, setGuards] = useState(10),
    [riders, setRiders] = useState(0),
    [error, setError] = useState('');
  const select = useCallback((id: string) => {
    setSelectedId(id);
    setError('');
  }, []);
  const site = data.sites.find((item) => item.id === selectedId);
  const troops = { ...emptyTroops(), guard: guards, rider: riders };
  const preview = site ? gatherPreview(data.config, data.origin, site, troops) : null;
  const loot = site && preview ? abandonedLoot(site.available, Math.max(0, preview.carry)) : null;
  const valid =
    Number.isInteger(guards) &&
    Number.isInteger(riders) &&
    guards >= 0 &&
    riders >= 0 &&
    guards <= data.origin.troops.guard &&
    riders <= data.origin.troops.rider &&
    (preview?.carry ?? 0) > 0 &&
    !!site &&
    resourceKeys.some((key) => site.available[key] > 0);
  async function send() {
    if (!site || !valid || busy) return;
    setError('');
    try {
      await onCommand({
        type: 'gatherAbandoned',
        villageId: data.origin.id,
        targetId: site.id,
        troops,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال البعثة');
    }
  }
  return (
    <main className={styles.preview}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>تحدي المماليك · عالم اختبار محلي</p>
          <h1>القرى المهجورة</h1>
          <p>مواقع ثابتة على اليابسة، بموارد مشتركة بين لاعبي العالم.</p>
        </div>
        <div className={styles.total}>
          <strong>{data.sites.length}</strong>
          <span>قرية بلا حامية</span>
        </div>
      </header>
      <div className={styles.layout}>
        <div className={styles.mapColumn}>
          <AbandonedVillageMap
            sites={data.sites}
            basemap={basemap}
            selectedId={selectedId}
            onSelect={select}
          />
          <section className={styles.catalog} aria-label="قائمة القرى المهجورة">
            <h2>اختر وجهة البعثة</h2>
            <div className={styles.siteList}>
              {data.sites.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === selectedId}
                  onClick={() => select(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className={styles.panel} aria-label="تفاصيل البعثة">
          {!site ? (
            <>
              <h2>وجهة جديدة لموارد قريتك</h2>
              <p>اختر قرية من الخريطة أو القائمة لعرض مخزونها وإرسال القوات.</p>
              <dl className={styles.rules}>
                <div>
                  <dt>السعة لكل مورد</dt>
                  <dd>3000</dd>
                </div>
                <div>
                  <dt>التجدد لكل مورد</dt>
                  <dd>100 / ساعة</dd>
                </div>
                <div>
                  <dt>أنواع الموارد</dt>
                  <dd>5</dd>
                </div>
              </dl>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>قرية مهجورة · بلا حامية</p>
              <h2>{site.name}</h2>
              <p>المخزون متاح للجميع. الحمولة المتوقعة قد تتغير قبل الوصول.</p>
              <div className={styles.stocks}>
                {resourceKeys.map((key) => (
                  <div className={styles.stock} key={key}>
                    <ResourceIcon resource={key} />
                    <span>{abandonedResourceNames[key]}</span>
                    <strong data-testid={`stock-${key}`}>{site.available[key]}</strong>
                    <span className={styles.muted}>/ {site.capacityPerResource}</span>
                    <progress
                      aria-label={`مخزون ${abandonedResourceNames[key]}`}
                      value={site.available[key]}
                      max={site.capacityPerResource}
                    />
                  </div>
                ))}
              </div>
              <p className={styles.muted}>
                يتجدد كل مورد بمقدار {site.regenerationPerResourceHour} في الساعة.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <h3>القوات من {data.origin.name}</h3>
                <label className={styles.inputRow}>
                  الحرس <span>المتاح {data.origin.troops.guard}</span>
                  <input
                    aria-label="عدد الحرس"
                    type="number"
                    min="0"
                    max={data.origin.troops.guard}
                    value={guards}
                    onChange={(e) => setGuards(Number(e.target.value))}
                  />
                </label>
                <label className={styles.inputRow}>
                  الفرسان <span>المتاح {data.origin.troops.rider}</span>
                  <input
                    aria-label="عدد الفرسان"
                    type="number"
                    min="0"
                    max={data.origin.troops.rider}
                    value={riders}
                    onChange={(e) => setRiders(Number(e.target.value))}
                  />
                </label>
                <dl className={styles.rules}>
                  <div>
                    <dt>حمولة الجيش الكلية</dt>
                    <dd data-testid="army-carry">{preview?.carry ?? 0}</dd>
                  </div>
                  <div>
                    <dt>السفر ذهابًا وعودة</dt>
                    <dd>{Math.ceil((preview?.roundTripMs ?? 0) / 60000)} دقيقة</dd>
                  </div>
                </dl>
                {loot && (
                  <p>
                    المتوقع:{' '}
                    {resourceKeys
                      .map((key) => `${loot[key]} ${abandonedResourceNames[key]}`)
                      .join('، ')}
                    .
                  </p>
                )}
                <button className={styles.primary} type="submit" disabled={!valid || busy}>
                  {busy ? 'جارٍ إرسال البعثة…' : 'إرسال بعثة جمع'}
                </button>
                {error && <p role="alert">{error}</p>}
              </form>
            </>
          )}
          <section aria-label="البعثات والتقارير">
            <h3>البعثات والتقارير</h3>
            {data.movements.map((move) => (
              <p key={move.id} role="status">
                {move.mission === 'return'
                  ? 'القوات في طريق العودة'
                  : 'البعثة في طريقها إلى القرية'}
              </p>
            ))}
            {!data.movements.length && <p className={styles.muted}>لا توجد بعثة في الطريق.</p>}
            {data.reports.slice(0, 4).map((report) => (
              <article className={styles.report} key={report.id}>
                <strong>{report.title}</strong>
                <p>{report.detail}</p>
              </article>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
