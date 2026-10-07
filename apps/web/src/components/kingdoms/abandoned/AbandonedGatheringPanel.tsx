'use client';

import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { gatherPreview } from '@/lib/kingdoms/resource-sites';
import { abandonedLoot, abandonedResourceNames } from '@/lib/kingdoms/abandoned-villages';
import { emptyTroops, storageCapacity } from '@/lib/kingdoms/simulation';
import { resourceKeys, unitKeys } from '@/lib/kingdoms/types';
import type { AbandonedVillageView } from '@/lib/kingdoms/abandoned-village-types';
import { canSelectCommander, CommanderSelect } from '../commander-select';
import { ResourceIcon } from '../resource-icon';
import { date, number, type GameProps } from '../shared';
import styles from '../resource-site-panel.module.css';

export function AbandonedGatheringPanel({
  view,
  village,
  busy,
  send,
  site,
}: GameProps & { site: AbandonedVillageView }) {
  const [troops, setTroops] = useState(emptyTroops);
  const [commanderId, setCommanderId] = useState('');
  const commander = view.commanders?.find((c) => c.id === commanderId);
  const troopCountsValid = unitKeys.every(
    (key) =>
      Number.isSafeInteger(troops[key]) && troops[key] >= 0 && troops[key] <= village.troops[key],
  );
  const preview = gatherPreview(
    view.config,
    village,
    site,
    troopCountsValid ? troops : emptyTroops(),
    commander,
  );
  const loot = abandonedLoot(site.available, preview.carry);
  const reason = view.paused
    ? 'العالم موقوف مؤقتًا.'
    : view.season.status === 'ended' || view.serverNow >= view.season.endsAt
      ? 'انتهى الموسم.'
      : !resourceKeys.some((key) => site.available[key] > 0)
        ? 'القرية فارغة الآن؛ تتجدد مواردها تدريجيًا.'
        : commanderId && (!commander || !canSelectCommander(commander, village.id, view.serverNow))
          ? 'القائد المحدد غير متاح.'
          : !troopCountsValid
            ? 'تحقق من أعداد القوات المتاحة.'
            : preview.carry <= 0
              ? 'اختر قوات قادرة على حمل الموارد.'
              : view.serverNow + preview.roundTripMs >= view.season.endsAt
                ? 'لن تعود البعثة قبل نهاية الموسم.'
                : null;
  const overflow = resourceKeys.some(
    (key) => village.resources[key] + loot[key] > storageCapacity(view.config, village),
  );
  return (
    <section className={styles.gathering} aria-label="جمع موارد القرية المهجورة">
      <div className={styles.gatherHead}>
        <div>
          <p className={styles.eyebrow}>قرية مهجورة · بلا حامية</p>
          <h3>{site.name}</h3>
        </div>
      </div>
      <p className={styles.hint}>
        مخزون مشترك للجميع؛ {number(site.capacityPerResource)} حد أقصى و
        {number(site.regenerationPerResourceHour)} في الساعة لكل مورد. لا يمكن احتلال القرية.
      </p>
      <div className={styles.estimate}>
        {resourceKeys.map((key) => (
          <p key={key}>
            <ResourceIcon resource={key} size={24} /> {abandonedResourceNames[key]}:{' '}
            <strong>{number(site.available[key])}</strong>
          </p>
        ))}
      </div>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !reason)
            void send({
              type: 'gatherAbandoned',
              villageId: village.id,
              targetId: site.id,
              troops,
              ...(commanderId ? { commanderId } : {}),
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
        <fieldset className={styles.troops} disabled={busy}>
          <legend>القوات من {village.name}</legend>
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
            سعة الحمل الإجمالية: <strong>{number(preview.carry)}</strong>
          </p>
          {resourceKeys.map((key) => (
            <p key={key}>
              الجمع المتوقع من {abandonedResourceNames[key]}: <strong>{number(loot[key])}</strong>
            </p>
          ))}
          {preview.travelMs > 0 && (
            <>
              <p>الوصول المتوقع: {date(view.serverNow + preview.travelMs)}</p>
              <p>العودة المتوقعة: {date(view.serverNow + preview.roundTripMs)}</p>
            </>
          )}
        </div>
        <p className={styles.hint}>
          يتحدد المحصول عند الوصول حسب المخزون المتبقي. تصل الموارد إلى قريتك عند عودة الجيش؛ الذهب
          هنا مورد لعب عادي.
        </p>
        {overflow && (
          <p className={styles.warning}>
            قد يتجاوز المحصول سعة مستودعك؛ الفائض عند العودة لا يُخزن.
          </p>
        )}
        <Button type="submit" variant="gold" loading={busy} disabled={busy || reason !== null}>
          إرسال بعثة جمع
        </Button>
        <p className={styles.hint} role="status">
          {busy ? 'جارٍ إرسال الأمر…' : (reason ?? 'بعثة جمع موارد بلا قتال.')}
        </p>
      </form>
    </section>
  );
}
