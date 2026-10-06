'use client';

import { useEffect, useRef } from 'react';
import { ArrowRightLeft, Eye, Hammer, Pause, Shield, Swords } from 'lucide-react';
import { unitKeys, type Mission } from '@/lib/kingdoms/types';
import { trainingBuilding } from '@/lib/kingdoms/training';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import {
  formatCountdown,
  incomingMissionLabels,
  presentIncomingThreats,
  remainingMs,
  villageIncoming,
} from '@/lib/kingdoms/incoming-threats';
import { date, number, type GameProps } from '../shared';
import { useViewClock } from '../use-view-clock';
import styles from './village-activity.module.css';

type Props = Pick<GameProps, 'view' | 'village'> & {
  onFocus?: (building: VillageSelection) => void;
  onShowMap?: (villageId: string) => void;
  onRefresh?: () => void;
};
const missions: Record<Mission, string> = {
  attack: 'هجوم', raid: 'غارة', scout: 'استطلاع', reinforce: 'تعزيز',
  settle: 'استيطان', occupy: 'احتلال', return: 'عودة', gather: 'جمع الموارد',
  intercept: 'اعتراض',
};
function QueueTime({ endsAt, now, label }: { endsAt: number; now: number; label: string }) {
  const remaining = remainingMs(endsAt, now);
  return remaining ? (
    <time className={styles.time} dateTime={new Date(endsAt).toISOString()} title={date(endsAt)}>
      <span>الوقت المتبقي </span>
      <bdi dir="ltr" aria-label={`الوقت المتبقي ${label}`}>{formatCountdown(remaining)}</bdi>
    </time>
  ) : <span className={styles.waiting}>بانتظار تأكيد الاكتمال</span>;
}

/** Displays server-confirmed village activity; elapsed time is presentation only. */
export function VillageActivity({ view, village, onFocus, onShowMap, onRefresh }: Props) {
  const owned = view.movements.filter((movement) => movement.sourceId === village.id ||
    (movement.targetX === village.x && movement.targetY === village.y));
  const outgoing = view.movements.filter((movement) => movement.sourceId === village.id && movement.mission !== 'return');
  const returning = view.movements.filter((movement) =>
    movement.mission === 'return' && movement.targetX === village.x && movement.targetY === village.y);
  const incoming = villageIncoming(presentIncomingThreats(view.incoming ?? [], view.serverNow), village.id);
  const nextOwned = owned.reduce<(typeof owned)[number] | undefined>(
    (first, movement) => !first || movement.arrivesAt < first.arrivesAt ? movement : first,
    undefined,
  );
  const deadline = Math.max(view.serverNow, village.build?.endsAt ?? 0,
    village.training?.endsAt ?? 0, ...owned.map((movement) => movement.arrivesAt),
    ...incoming.map((movement) => movement.arrivesAt));
  const now = useViewClock(view, deadline, village.id);
  const asked = useRef(false);
  useEffect(() => {
    if (!onRefresh || asked.current) return;
    if (!incoming.some((row) => remainingMs(row.arrivesAt, now) === 0)) return;
    asked.current = true;
    onRefresh();
  }, [incoming, now, onRefresh]);
  const troops = unitKeys.reduce((total, unit) => total + village.troops[unit], 0);
  const trainingTarget = village.training ? trainingBuilding(village.training.unit) : 'barracks';
  const liveIncoming = villageIncoming(presentIncomingThreats(view.incoming ?? [], now), village.id)
    .slice()
    .sort((left, right) => left.arrivesAt - right.arrivesAt || left.id.localeCompare(right.id, 'en'));

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
            {nextOwned || liveIncoming.length ? <>
              <p>خارجة {number(outgoing.length)} · عائدة {number(returning.length)} · قادمة {number(liveIncoming.length)}</p>
              <span>
                التالي: {liveIncoming[0]
                  ? incomingMissionLabels[liveIncoming[0].mission]
                  : `${missions[nextOwned!.mission]} ${nextOwned!.targetX === village.x && nextOwned!.targetY === village.y ? 'إلى القرية' : 'من القرية'}`}
              </span>
              <QueueTime
                endsAt={liveIncoming[0]?.arrivesAt ?? nextOwned!.arrivesAt}
                now={now}
                label="لوصول القوات"
              />
            </> : <p>لا تحركات من القرية أو إليها</p>}
          </div>
        </div>
      </div>
      <div className={styles.marches} aria-label="تفصيل تحركات القرية">
        <section>
          <h4><Swords size={16} aria-hidden="true" /> القوات الخارجة</h4>
          {outgoing.length ? outgoing.map((movement) => (
            <p key={movement.id}>
              {missions[movement.mission]}
              <QueueTime endsAt={movement.arrivesAt} now={now} label={missions[movement.mission]} />
            </p>
          )) : <p>لا قوات خارجة</p>}
        </section>
        <section>
          <h4><ArrowRightLeft size={16} aria-hidden="true" /> القوات العائدة</h4>
          {returning.length ? returning.map((movement) => (
            <p key={movement.id}>
              عودة
              <QueueTime endsAt={movement.arrivesAt} now={now} label="للعودة" />
            </p>
          )) : <p>لا قوات عائدة</p>}
        </section>
        <section>
          <h4><Eye size={16} aria-hidden="true" /> القوات القادمة</h4>
          {liveIncoming.length ? liveIncoming.map((threat) => (
            <div className={styles.incoming} key={threat.id} data-severity={threat.severity}>
              <p>
                <Shield size={14} aria-hidden="true" />
                {incomingMissionLabels[threat.mission]}
                {threat.source ? ` · ${threat.source.name}` : ''}
              </p>
              <QueueTime endsAt={threat.arrivesAt} now={now} label={incomingMissionLabels[threat.mission]} />
              {onShowMap && (
                <button className={styles.action} type="button" onClick={() => onShowMap(village.id)}>
                  عرض على الخريطة
                </button>
              )}
            </div>
          )) : <p>لا قوات قادمة</p>}
        </section>
      </div>
    </section>
  );
}
