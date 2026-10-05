'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, Select } from '@/components/ui';
import { gatherPreview } from '@/lib/kingdoms/resource-sites';
import { storageCapacity } from '@/lib/kingdoms/simulation';
import {
  unitKeys,
  type ResourceSiteKind,
  type ResourceSiteView,
  type Troops,
} from '@/lib/kingdoms/types';
import { ResourceIcon } from './resource-icon';
import { date, number, type GameProps } from './shared';
import styles from './resource-site-panel.module.css';
import { canSelectCommander, CommanderSelect } from './commander-select';
import { commanderText } from './commander-ui';

export const siteResourceLabels: Record<ResourceSiteKind, string> = {
  wood: 'خشب',
  iron: 'حديد',
  food: 'قمح',
};

type Point = { x: number; y: number };
export function ResourceSiteDirectory({
  sites,
  origin,
  target,
  onLocate,
}: {
  sites: ResourceSiteView[];
  origin: Point;
  target: Point;
  onLocate: (site: ResourceSiteView) => void;
}) {
  const [filter, setFilter] = useState('all');
  const filtered = sites
    .filter((site) => filter === 'all' || site.resource === filter)
    .toSorted(
      (a, b) =>
        Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y) ||
        a.id.localeCompare(b.id),
    );
  return (
    <section className={styles.directory} aria-label="مواقع الموارد القريبة">
      <div className={styles.directoryHead}>
        <h3>مواقع الموارد القريبة</h3>
        <Select
          label="نوع المورد"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">كل الموارد</option>
          <option value="wood">الخشب</option>
          <option value="iron">الحديد</option>
          <option value="food">القمح</option>
        </Select>
      </div>
      <p className={styles.hint}>
        مواقع مكشوفة قرب قراك. اختر موقعًا لعرضه وإرسال جيش لجمع موارده.
      </p>
      <div className={styles.siteList}>
        {filtered.slice(0, 12).map((site) => (
          <button
            key={site.id}
            type="button"
            className={styles.siteRow}
            aria-label={`اعرض ${site.name} على الخريطة، X ${site.x}، Y ${site.y}`}
            aria-pressed={site.x === target.x && site.y === target.y}
            onClick={() => onLocate(site)}
          >
            <ResourceIcon resource={site.resource} size={32} />
            <span className={styles.siteCopy}>
              <strong>{site.name}</strong>
              <small>
                {site.available > 0
                  ? `${number(site.available)} ${siteResourceLabels[site.resource]} متاح`
                  : 'ناضب الآن · يتجدد تدريجيًا'}
              </small>
            </span>
            <span className={styles.location}>
              <bdi dir="ltr">
                {site.x}, {site.y}
              </bdi>
              <small>
                {Math.hypot(site.x - origin.x, site.y - origin.y).toLocaleString('ar-SA', {
                  maximumFractionDigits: 1,
                })}{' '}
                خانة
              </small>
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && <p className={styles.hint}>لا مواقع لهذا المورد مكشوفة قرب قراك.</p>}
      {filtered.length > 12 && (
        <p className={styles.hint}>
          أقرب ١٢ موقعًا إلى القرية المختارة. غيّر نوع المورد للوصول إلى غيرها.
        </p>
      )}
    </section>
  );
}

export function GatheringPanel({
  view,
  village,
  busy,
  send,
  site,
  focusOnMount = false,
}: GameProps & { site: ResourceSiteView; focusOnMount?: boolean }) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [troops, setTroops] = useState<Troops>({ guard: 0, rider: 0, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 });
  const [commanderId, setCommanderId] = useState('');
  const selectedCommander = view.commanders?.find((commander) => commander.id === commanderId);
  const commanderAvailable =
    !commanderId ||
    (view.commanders ?? []).some(
      (commander) =>
        commander.id === commanderId && canSelectCommander(commander, village.id, view.serverNow),
    );
  useEffect(() => {
    if (focusOnMount) heading.current?.focus();
  }, [focusOnMount]);
  const preview = gatherPreview(view.config, village, site, troops, selectedCommander);
  const amount = Math.min(preview.carry, site.available);
  const label = siteResourceLabels[site.resource];
  const availableTroops = unitKeys.every(
    (key) =>
      Number.isInteger(troops[key]) && troops[key] >= 0 && troops[key] <= village.troops[key],
  );
  const reason = view.paused
    ? 'العالم متوقف مؤقتًا.'
    : view.season.status === 'ended' || view.serverNow >= view.season.endsAt
      ? 'انتهى الموسم.'
      : site.available <= 0
        ? 'الموقع ناضب الآن. اختر موقعًا آخر أو انتظر تجدّد موارده.'
        : !commanderAvailable
          ? commanderText('commander.selectionExpired')
          : !availableTroops
            ? 'اختر عددًا من القوات المتاحة في قريتك.'
            : preview.carry <= 0
              ? 'اختر قوات تستطيع حمل الموارد؛ الحراس والفرسان يحملونها حسب قدراتهم.'
              : view.serverNow + preview.roundTripMs >= view.season.endsAt
                ? 'لن يعود الجيش قبل نهاية الموسم. اختر موقعًا أقرب أو قوات أسرع.'
                : null;
  const overflow =
    village.resources[site.resource] + amount > storageCapacity(view.config, village);
  const disabled = busy || reason !== null;
  return (
    <section className={styles.gathering} aria-label="جمع الموارد">
      <div className={styles.gatherHead}>
        <ResourceIcon resource={site.resource} size={32} />
        <div>
          <p className={styles.eyebrow}>إرسال جيش لجمع الموارد</p>
          <h3 ref={heading} tabIndex={-1}>
            {site.name}
          </h3>
        </div>
      </div>
      <p className={styles.stock}>
        المتاح الآن:{' '}
        <strong>
          {number(site.available)} من {number(site.capacity)} {label}
        </strong>
      </p>
      <p className={styles.hint}>
        يتجدد بمعدل {number(site.regenerationPerHour)} {label} في الساعة.
        {site.resource === 'food' && ' القمح يضاف إلى مخزون الغذاء.'}
      </p>
      <p className={styles.hint}>
        الوجهة{' '}
        <bdi dir="ltr">
          ({site.x}, {site.y})
        </bdi>{' '}
        · الانطلاق من {village.name}. تُجمع الموارد عند الوصول ثم يعود الجيش.
      </p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled)
            void send({
              type: 'march',
              villageId: village.id,
              targetX: site.x,
              targetY: site.y,
              mission: 'gather',
              ...(commanderId ? { commanderId } : {}),
              troops,
            });
        }}
      >
        <CommanderSelect
          view={view}
          villageId={village.id}
          value={commanderId}
          onChange={setCommanderId}
          disabled={busy}
        />
        <fieldset disabled={busy} className={styles.troops}>
          <legend>القوات المرسلة</legend>
          {unitKeys.map((unit) => (
            <Input
              key={unit}
              label={`${view.config.units[unit].name} (${number(village.troops[unit])} متاح)`}
              name={unit}
              type="number"
              min="0"
              max={village.troops[unit]}
              step="1"
              required
              dir="ltr"
              value={troops[unit]}
              onChange={(event) =>
                setTroops((current) => ({ ...current, [unit]: Number(event.target.value) }))
              }
            />
          ))}
        </fieldset>
        <div className={styles.estimate}>
          <p>
            سعة حمل الجيش: <strong>{number(preview.carry)}</strong>
          </p>
          <p>
            الجمع المتوقع:{' '}
            <strong>
              {number(amount)} {label}
            </strong>
          </p>
          {preview.travelMs > 0 && view.serverNow + preview.roundTripMs < view.season.endsAt && (
            <>
              <p>
                الوصول المتوقع:{' '}
                <time dateTime={new Date(view.serverNow + preview.travelMs).toISOString()}>
                  {date(view.serverNow + preview.travelMs)}
                </time>
              </p>
              <p>
                العودة المتوقعة:{' '}
                <time dateTime={new Date(view.serverNow + preview.roundTripMs).toISOString()}>
                  {date(view.serverNow + preview.roundTripMs)}
                </time>
              </p>
            </>
          )}
          <p className={styles.hint}>
            المتاح غير محجوز؛ قد تجمع الجيوش الأخرى منه قبل وصولك. الموارد تصبح لك عند عودة الجيش.
          </p>
        </div>
        {overflow && (
          <p className={styles.warning}>
            المخزن لا يتسع للجمع المتوقع. أنفق بعض{' '}
            {site.resource === 'wood' ? 'الخشب' : site.resource === 'iron' ? 'الحديد' : 'الغذاء'}{' '}
            قبل عودة الجيش؛ تُفقد الموارد الزائدة عن سعة المخزن عند العودة.
          </p>
        )}
        <Button
          type="submit"
          variant="gold"
          loading={busy}
          disabled={disabled}
          aria-describedby={`${id}-reason`}
        >
          أرسل الجيش لجمع الموارد
        </Button>
        <p id={`${id}-reason`} className={styles.hint} role="status">
          {busy ? 'جارٍ إرسال الطلب…' : (reason ?? 'الجيش يجمع الموارد دون مهاجمة القرى.')}
        </p>
      </form>
    </section>
  );
}
