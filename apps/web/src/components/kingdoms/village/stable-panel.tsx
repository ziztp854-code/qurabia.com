'use client';

import { Clock, Swords, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { stableUnlockVillageLevel, trainingDurationMs } from '@/lib/kingdoms/training';
import { resourceKeys, unitKeys } from '@/lib/kingdoms/types';
import { date, labels, number, type GameProps } from '../shared';
import type { VillageNavigation } from '../building-panel';
import styles from '../building-panel.module.css';

export type StablePanelProps = GameProps & {
  onClose: () => void;
  onNavigate?: (tab: VillageNavigation) => void;
};

function formatDuration(seconds: number) {
  const total = Math.ceil(seconds);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

export function StablePanel({
  view,
  village,
  busy,
  send,
  onClose,
  onNavigate,
}: StablePanelProps) {
  const [count, setCount] = useState('1');
  const title = useRef<HTMLHeadingElement>(null);
  const amount = Number(count);
  const unit = view.config.units.rider;
  const homeTroops = unitKeys.reduce((sum, key) => sum + village.troops[key], 0);
  const movingTroops = view.movements
    .filter((movement) => movement.sourceId === village.id)
    .reduce(
      (sum, movement) => sum + unitKeys.reduce((total, key) => total + movement.troops[key], 0),
      0,
    );
  const reinforcingTroops = view.villages.reduce((sum, host) => {
    const troops = host.reinforcements[village.id];
    return sum + (troops ? unitKeys.reduce((total, key) => total + troops[key], 0) : 0);
  }, 0);
  const remainingArmy = Math.max(0, 1e6 - homeTroops - movingTroops - reinforcingTroops);
  const maximum = Math.max(
    0,
    Math.min(
      10000,
      remainingArmy,
      ...resourceKeys
        .filter((resource) => unit.cost[resource] > 0)
        .map((resource) =>
          Math.floor(Math.floor(village.resources[resource]) / unit.cost[resource]),
        ),
    ),
  );
  const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 10000;
  const shortage = resourceKeys.some(
    (resource) => village.resources[resource] < Math.ceil(unit.cost[resource] * amount),
  );
  const stableLevel = village.buildings.stable;
  const stableSpec = view.config.buildings.stable;
  const upgradeFactor = stableSpec.growth ** stableLevel;
  const upgradeCost = Object.fromEntries(
    resourceKeys.map((resource) => [
      resource,
      Math.ceil(stableSpec.cost[resource] * upgradeFactor),
    ]),
  ) as typeof village.resources;
  const upgradeSeconds = stableSpec.seconds * upgradeFactor;
  const maxed = stableLevel >= stableSpec.maxLevel;
  const locked =
    (village.progression?.level ?? 1) < stableUnlockVillageLevel || village.buildings.barracks < 1;
  const upgradeShortage = resourceKeys.some(
    (resource) => village.resources[resource] < upgradeCost[resource],
  );
  const building =
    village.build?.building === 'stable' ||
    village.constructionQueue?.some(
      (item) => item.building === 'stable' && (item.status === 'BUILDING' || item.status === 'QUEUED'),
    );
  const reason =
    stableLevel <= 0
      ? 'ابنِ الإسطبل أولاً لتدريب الفرسان.'
      : village.training
        ? 'يوجد تدريب جارٍ. انتظر اكتماله قبل تدريب الفرسان.'
        : remainingArmy < 1 || amount > remainingArmy
          ? 'بلغ الجيش الحد الأعلى.'
          : shortage
            ? 'الموارد الحالية لا تكفي لتدريب هذا العدد.'
            : !validAmount
              ? `اختر عدداً صحيحاً من ${number(1)} إلى ${number(maximum)}.`
              : null;
  const disabled = busy || reason !== null;
  const costAmount = validAmount ? amount : 1;
  const trainingSeconds = Math.max(
    1,
    Math.ceil(
      trainingDurationMs(
        unit.seconds,
        costAmount,
        stableLevel,
        view.config.barracksSpeedPerLevel,
      ),
    ) / 1000,
  );
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [village.id]);
  return (
    <section
      className={styles.panel}
      aria-label="تفاصيل الإسطبل"
      data-village-building-sheet
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>مبنى الفرسان</p>
          <h3 ref={title} tabIndex={-1}>
            {stableSpec.name}
          </h3>
        </div>
        <Button variant="ghost" size="icon" aria-label="أغلق تفاصيل المبنى" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      <p className={styles.level}>مستوى الإسطبل {number(stableLevel)}</p>
      <p>
        سرعة تدريب الفرسان:{' '}
        <bdi>
          {stableLevel > 0
            ? `×${(1 + (stableLevel - 1) * view.config.barracksSpeedPerLevel).toLocaleString('ar-SA', { maximumFractionDigits: 2 })}`
            : 'مغلق'}
        </bdi>
      </p>
      {village.build?.building === 'stable' ? (
        <p>
          قيد البناء حتى المستوى {number(village.build.level)}. يكتمل{' '}
          <time dateTime={new Date(village.build.endsAt).toISOString()}>
            {date(village.build.endsAt)}
          </time>
        </p>
      ) : maxed ? (
        <p>بلغ الإسطبل الحد الأعلى.</p>
      ) : (
        <>
          <p>
            ترقية إلى المستوى {number(stableLevel + 1)} خلال{' '}
            <bdi dir="ltr">{formatDuration(upgradeSeconds)}</bdi>
          </p>
          <ul className={styles.costs} aria-label="تكلفة ترقية الإسطبل">
            {resourceKeys
              .filter((resource) => upgradeCost[resource] > 0)
              .map((resource) => (
                <li key={resource} data-short={village.resources[resource] < upgradeCost[resource]}>
                  <span>{labels[resource]}</span>
                  <bdi>{number(upgradeCost[resource])}</bdi>
                </li>
              ))}
          </ul>
          {locked && (
            <p role="status" className={styles.hint}>
              يُفتح الإسطبل عند مستوى القرية {number(stableUnlockVillageLevel)} وبعد بناء الثكنة.
            </p>
          )}
        </>
      )}
      <p>
        الفرسان الجاهزون: <bdi aria-label="الفرسان الجاهزون">{number(village.troops.rider)}</bdi>
      </p>
      {village.training?.unit === 'rider' && (
        <p aria-label="قائمة تدريب القرية">
          يتدرب الآن {number(village.training.count)}{' '}
          {view.config.units[village.training.unit].name}. يكتمل{' '}
          <time dateTime={new Date(village.training.endsAt).toISOString()}>
            {date(village.training.endsAt)}
          </time>
        </p>
      )}
      {reason && (
        <p role="status" className={styles.hint}>
          {reason}
        </p>
      )}
      <form
        className={styles.actions}
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          void send({ type: 'train', villageId: village.id, unit: 'rider', count: Number(count) });
        }}
      >
        <Input
          label="عدد الفرسان"
          type="number"
          name="count"
          min="1"
          max={Math.max(1, maximum)}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          required
          dir="ltr"
        />
        <ul className={styles.costs} aria-label="تكلفة تدريب الفرسان">
          {resourceKeys
            .filter((resource) => unit.cost[resource] > 0)
            .map((resource) => {
              const cost = Math.ceil(unit.cost[resource] * costAmount);
              return (
                <li key={resource} data-short={village.resources[resource] < cost}>
                  <span>{labels[resource]}</span>
                  <bdi>{number(cost)}</bdi>
                </li>
              );
            })}
        </ul>
        <p className={styles.duration}>
          <Clock size={16} aria-hidden="true" />
          مدة تدريب العدد المختار <bdi dir="ltr">{formatDuration(trainingSeconds)}</bdi>
        </p>
        <Button type="submit" disabled={disabled}>
          درّب الفرسان
        </Button>
      </form>
      <p className={styles.hint}>
        يستخدم الفرسان قائمة تدريب القرية. تُحتسب القوات المنتشرة عند اعتماد أمر التدريب.
      </p>
      <div className={styles.actions}>
        <Button
          variant="outline"
          disabled={busy || locked || maxed || upgradeShortage || Boolean(building)}
          onClick={() => void send({ type: 'build', villageId: village.id, building: 'stable' })}
        >
          طوّر الإسطبل
        </Button>
        {onNavigate && (
          <Button variant="outline" onClick={() => onNavigate('army')}>
            <Swords size={16} aria-hidden="true" />
            جهّز الجيش
          </Button>
        )}
      </div>
    </section>
  );
}
