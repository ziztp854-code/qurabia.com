'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Eye, Shield, Swords } from 'lucide-react';
import { Button, BottomSheet } from '@/components/ui';
import type { IncomingMovementView, Village } from '@/lib/kingdoms/types';
import {
  formatCountdown,
  hostileThreats,
  incomingMissionLabels,
  presentIncomingThreats,
  remainingMs,
  summarizeVillageThreats,
  threatSeverityLabels,
  villageIncoming,
  type IncomingThreat,
  type ThreatSeverity,
} from '@/lib/kingdoms/incoming-threats';
import { useViewClock } from './use-view-clock';
import styles from './incoming-alert.module.css';

type ClockView = { serverNow: number; revision?: number; paused?: boolean };

function ThreatIcon({ severity }: { severity: ThreatSeverity }) {
  if (severity === 'WARNING') return <Eye size={20} aria-hidden="true" />;
  if (severity === 'INFO') return <Shield size={20} aria-hidden="true" />;
  return <Swords size={20} aria-hidden="true" />;
}

function ArrivalText({
  arrivesAt,
  now,
  label,
}: {
  arrivesAt: number;
  now: number;
  label: string;
}) {
  const remaining = remainingMs(arrivesAt, now);
  if (!remaining) return <span className={styles.waiting}>بانتظار تأكيد الوصول</span>;
  return (
    <time dateTime={new Date(arrivesAt).toISOString()}>
        الوصول خلال <bdi className={styles.countdown} dir="ltr">{formatCountdown(remaining)}</bdi>
      <span className={styles.visuallyHidden}> {label}</span>
    </time>
  );
}

function dueForRefresh(threats: readonly IncomingThreat[], now: number) {
  return threats.some((threat) => remainingMs(threat.arrivesAt, now) === 0);
}

export function IncomingThreatList({
  threats,
  now,
  villages,
  onShowMap,
}: {
  threats: readonly IncomingThreat[];
  now: number;
  villages: readonly Pick<Village, 'id' | 'name'>[];
  onShowMap?: (villageId: string) => void;
}) {
  const names = new Map(villages.map((village) => [village.id, village.name]));
  return (
    <div className={styles.list}>
      {threats.map((threat) => (
        <article className={styles.row} key={threat.id} data-severity={threat.severity}>
          <strong>
            {incomingMissionLabels[threat.mission]} · {threatSeverityLabels[threat.severity]}
          </strong>
          <p>
            الهدف: {names.get(threat.targetVillageId) ?? threat.targetVillageId}
            {threat.source ? ` · المصدر: ${threat.source.name}` : ''}
          </p>
          <ArrivalText arrivesAt={threat.arrivesAt} now={now} label={incomingMissionLabels[threat.mission]} />
          {onShowMap && (
            <Button variant="outline" onClick={() => onShowMap(threat.targetVillageId)}>
              عرض على الخريطة
            </Button>
          )}
        </article>
      ))}
    </div>
  );
}

export function GlobalMilitaryAlert({
  incoming,
  villages,
  view,
  onShowMap,
  onRefresh,
  onFocusVillage,
}: {
  incoming: readonly IncomingMovementView[];
  villages: readonly Pick<Village, 'id' | 'name'>[];
  view: ClockView;
  onShowMap: (villageId: string) => void;
  onRefresh?: () => void;
  onFocusVillage?: (villageId: string) => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const deadline = incoming.reduce((latest, row) => Math.max(latest, row.arrivesAt), view.serverNow);
  const now = useViewClock(view, deadline);
  const threats = presentIncomingThreats(incoming, now);
  const hostile = hostileThreats(threats);
  const asked = useRef(false);
  useEffect(() => {
    if (!onRefresh || !dueForRefresh(threats, now) || asked.current) return;
    asked.current = true;
    onRefresh();
  }, [now, onRefresh, threats]);
  if (!threats.length) return null;
  const lead = hostile[0] ?? threats[0];
  const names = new Map(villages.map((village) => [village.id, village.name]));
  const summary = summarizeVillageThreats(threats, villages);
  return (
    <>
      <section
        className={styles.alert}
        data-severity={lead.severity}
        data-pulse={lead.severity === 'CRITICAL' || undefined}
        role={hostile.length ? 'alert' : 'status'}
        aria-live="off"
        aria-atomic="false"
        aria-labelledby={titleId}
      >
        <div className={styles.head}>
          <div className={styles.title}>
            <ThreatIcon severity={lead.severity} />
            <div>
              <h2 id={titleId}>{hostile.length ? 'تحذير عسكري' : 'حركات قادمة'}</h2>
              <p className={styles.meta}>
                {hostile.length ? (
                  <>
                    الهجمات القادمة <span className={styles.count}>{hostile.length}</span>
                    {hostile.length > 1
                      ? ` · أقرب هجوم إلى ${names.get(lead.targetVillageId) ?? lead.targetVillageId}`
                      : ` · الهدف: ${names.get(lead.targetVillageId) ?? lead.targetVillageId}`}
                  </>
                ) : (
                  incomingMissionLabels[lead.mission]
                )}
              </p>
              <p className={styles.meta} aria-live="off">
                <ArrivalText arrivesAt={lead.arrivesAt} now={now} label="لأقرب تهديد" />
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setOpen(true)}>
              عرض التفاصيل
            </Button>
            <Button onClick={() => onShowMap(lead.targetVillageId)}>عرض على الخريطة</Button>
          </div>
        </div>
        {villages.length > 1 && (
          <ul className={styles.summary} aria-label="ملخص تهديدات القرى">
            {summary.map((item) => (
              <li key={item.villageId}>
                <button type="button" className={styles.meta} onClick={() => onFocusVillage?.(item.villageId)}>
                  {item.name}
                </button>
                <span>
                  {item.safe
                    ? 'آمنة'
                    : [
                        item.hostile ? `${item.hostile} هجوم قادم` : '',
                        item.scouts ? `${item.scouts} استطلاع قادم` : '',
                        item.reinforcements ? `${item.reinforcements} تعزيز قادم` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BottomSheet open={open} onOpenChange={setOpen} title="كل التهديدات القادمة">
        <IncomingThreatList threats={threats} now={now} villages={villages} onShowMap={onShowMap} />
      </BottomSheet>
    </>
  );
}

export function VillageIncomingAlert({
  incoming,
  village,
  view,
  onShowMap,
  onRefresh,
}: {
  incoming: readonly IncomingMovementView[];
  village: Pick<Village, 'id' | 'name'>;
  view: ClockView;
  onShowMap?: (villageId: string) => void;
  onRefresh?: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const local = incoming.filter((row) => row.targetVillageId === village.id);
  const deadline = local.reduce((latest, row) => Math.max(latest, row.arrivesAt), view.serverNow);
  const now = useViewClock(view, deadline);
  const threats = villageIncoming(presentIncomingThreats(local, now), village.id);
  const asked = useRef(false);
  useEffect(() => {
    if (!onRefresh || !dueForRefresh(threats, now) || asked.current) return;
    asked.current = true;
    onRefresh();
  }, [now, onRefresh, threats]);
  if (!threats.length) return null;
  const lead = threats[0];
  const extra = threats.length - 1;
  return (
    <>
      <section
        className={styles.alert}
        data-severity={lead.severity}
        data-pulse={lead.severity === 'CRITICAL' || undefined}
        role={lead.kind === 'hostile' ? 'alert' : 'status'}
        aria-live="off"
        aria-labelledby={titleId}
      >
        <div className={styles.head}>
          <div className={styles.title}>
            <ThreatIcon severity={lead.severity} />
            <div>
              <h3 id={titleId}>{incomingMissionLabels[lead.mission]}</h3>
              <p className={styles.meta}>
                إلى {village.name}
                {lead.source ? ` · المصدر: ${lead.source.name}` : ''}
                {extra > 0 ? ` · +${extra} حركات أخرى` : ''}
              </p>
              <p className={styles.meta} aria-live="off">
                <ArrivalText arrivesAt={lead.arrivesAt} now={now} label={incomingMissionLabels[lead.mission]} />
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <Button variant="outline" onClick={() => setOpen(true)}>
              التفاصيل
            </Button>
            {onShowMap && <Button onClick={() => onShowMap(village.id)}>عرض على الخريطة</Button>}
          </div>
        </div>
      </section>
      <BottomSheet open={open} onOpenChange={setOpen} title={`حركات ${village.name}`}>
        <IncomingThreatList threats={threats} now={now} villages={[village]} onShowMap={onShowMap} />
      </BottomSheet>
    </>
  );
}

export function GateThreatMarker({
  active,
  reducedMotion,
  style,
}: {
  active: boolean;
  reducedMotion: boolean;
  style: CSSProperties;
}) {
  if (!active) return null;
  return (
    <span
      className={styles.marker}
      style={style}
      data-pulse={!reducedMotion || undefined}
      aria-hidden="true"
    >
      <Swords size={14} />
    </span>
  );
}
