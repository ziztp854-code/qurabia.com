'use client';

import { Clock, Swords, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { resourceKeys, unitKeys } from '@/lib/kingdoms/types';
import { date, labels, number, type GameProps } from '../shared';
import type { VillageNavigation } from '../building-panel';
import styles from '../building-panel.module.css';

export type StablePanelProps = GameProps & {
  onClose: () => void;
  onSelectBarracks: () => void;
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
  onSelectBarracks,
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
  const reason =
    village.buildings.barracks <= 0
      ? 'ابنِ الثكنة أولاً لتدريب الفرسان.'
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
      (unit.seconds * costAmount * 1000) /
        (1 + Math.max(0, village.buildings.barracks - 1) * view.config.barracksSpeedPerLevel),
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
          <p className={styles.eyebrow}>ملحق الفرسان التابع للثكنة</p>
          <h3 ref={title} tabIndex={-1}>
            الإسطبل
          </h3>
        </div>
        <Button variant="ghost" size="icon" aria-label="أغلق تفاصيل المبنى" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      <p className={styles.level}>مستوى الثكنة {number(village.buildings.barracks)}</p>
      <p>
        الفرسان الجاهزون: <bdi aria-label="الفرسان الجاهزون">{number(village.troops.rider)}</bdi>
      </p>
      {village.training && (
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
        <Button variant="outline" onClick={onSelectBarracks}>
          تطوير الثكنة
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
