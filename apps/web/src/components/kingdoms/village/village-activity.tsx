'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Hammer, Pause, Swords } from 'lucide-react';
import { unitKeys, type Mission } from '@/lib/kingdoms/types';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import { date, number, type GameProps } from '../shared';
import styles from './village-activity.module.css';

type Props = Pick<GameProps, 'view' | 'village'> & {
  onFocus?: (building: VillageSelection) => void;
};
const missions: Record<Mission, string> = {
  attack: 'هجوم', raid: 'غارة', scout: 'استطلاع', reinforce: 'تعزيز',
  settle: 'استيطان', occupy: 'احتلال', return: 'عودة', gather: 'جمع الموارد',
};
function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${remainder}` : `${minutes}:${remainder}`;
}
function QueueTime({ endsAt, now, label }: { endsAt: number; now: number; label: string }) {
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return remaining ? (
    <time className={styles.time} dateTime={new Date(endsAt).toISOString()} title={date(endsAt)}>
      <span>الوقت المتبقي </span>
      <bdi dir="ltr" aria-label={`الوقت المتبقي ${label}`}>{duration(remaining)}</bdi>
    </time>
  ) : <span className={styles.waiting}>بانتظار تأكيد الاكتمال</span>;
}

/** Displays server-confirmed village activity; elapsed time is presentation only. */
export function VillageActivity({ view, village, onFocus }: Props) {
  const movements = view.movements.filter((movement) => movement.sourceId === village.id ||
    (movement.targetX === village.x && movement.targetY === village.y));
  const incoming = movements.filter((movement) =>
    movement.targetX === village.x && movement.targetY === village.y).length;
  const outgoing = movements.length - incoming;
  const next = movements.reduce<(typeof movements)[number] | undefined>(
    (first, movement) => !first || movement.arrivesAt < first.arrivesAt ? movement : first,
    undefined,
  );
  const deadline = Math.max(view.serverNow, village.build?.endsAt ?? 0,
    village.training?.endsAt ?? 0, ...movements.map((movement) => movement.arrivesAt));
  const snapshot = `${village.id}:${view.revision}:${view.serverNow}:${view.paused}`;
  const [clock, setClock] = useState({ snapshot, elapsed: 0 });
  const anchorRef = useRef<{ snapshot: string; startedAt: number } | null>(null);
  useEffect(() => {
    if (view.paused || deadline <= view.serverNow) return;
    if (anchorRef.current?.snapshot !== snapshot) {
      anchorRef.current = { snapshot, startedAt: performance.now() };
    }
    const anchor = anchorRef.current.startedAt;
    const timer = setInterval(() => {
      const elapsed = Math.max(0, performance.now() - anchor);
      setClock({ snapshot, elapsed: Math.min(elapsed, deadline - view.serverNow) });
      if (view.serverNow + elapsed >= deadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, snapshot, view.paused, view.serverNow]);
  const now = view.serverNow + (!view.paused && clock.snapshot === snapshot ? clock.elapsed : 0);
  const troops = unitKeys.reduce((total, unit) => total + village.troops[unit], 0);
  const trainingTarget = village.training?.unit === 'rider' ? 'stable' : 'barracks';

  return (
    <section className={styles.activity} aria-label="نشاط القرية" dir="rtl">
      <div className={styles.heading}>
        <h3>ما يحدث في القرية</h3>
        {view.paused && <span className={styles.paused}><Pause size={14} aria-hidden="true" />العالم متوقف مؤقتًا</span>}
      </div>
      <div className={styles.rows}>
        <div className={styles.item}>
          <Hammer size={19} aria-hidden="true" />
          <div className={styles.detail}>
            <h4>البناء {village.build && <span>· {view.paused ? 'متوقف' : 'جارٍ'}</span>}</h4>
            {village.build ? <>
              <p>{view.config.buildings[village.build.building].name}</p>
              <span>الحالي {number(village.buildings[village.build.building])} · قيد البناء {number(village.build.level)}</span>
              <QueueTime endsAt={village.build.endsAt} now={now} label="للبناء" />
            </> : <p>لا بناء قيد التنفيذ</p>}
          </div>
          {onFocus && <button className={styles.action} type="button"
            onClick={() => onFocus(village.build?.building ?? 'hall')}>
            {village.build ? 'متابعة البناء' : 'إدارة البناء'}
          </button>}
        </div>
        <div className={styles.item}>
          <Swords size={19} aria-hidden="true" />
          <div className={styles.detail}>
            <h4>القوات {village.training && <span>· {view.paused ? 'تدريب متوقف' : 'تدريب جارٍ'}</span>}</h4>
            {village.training ? <>
              <p>{number(village.training.count)} {view.config.units[village.training.unit].name} قيد التدريب</p>
              <QueueTime endsAt={village.training.endsAt} now={now} label="للتدريب" />
            </> : <p>لا وحدات قيد التدريب</p>}
            <span>{number(troops)} وحدة من قواتك في القرية</span>
          </div>
          {onFocus && <button className={styles.action} type="button" onClick={() => onFocus(trainingTarget)}>
            {village.training ? 'متابعة التدريب' : 'عرض الثكنة'}
          </button>}
        </div>
        <div className={styles.item}>
          <ArrowRightLeft size={19} aria-hidden="true" />
          <div className={styles.detail}>
            <h4>تحركات الجيش</h4>
            {next ? <>
              <p>قادمة {number(incoming)} · مغادرة {number(outgoing)}</p>
              <span>الوصول التالي: {missions[next.mission]} {next.targetX === village.x && next.targetY === village.y ? 'إلى القرية' : 'من القرية'}</span>
              <QueueTime endsAt={next.arrivesAt} now={now} label="لوصول القوات" />
            </> : <p>لا تحركات من القرية أو إليها</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
