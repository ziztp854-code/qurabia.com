'use client';

import { Binoculars, Flag, Map, ScrollText, Shield, Swords, Users, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui';
import {
  formatCountdown,
  incomingMissionLabels,
  remainingMs,
  threatSeverityLabels,
} from '@/lib/kingdoms/incoming-threats';
import {
  commanderStatusLabels,
  presentRallyCommand,
  rallyReadinessLabels,
} from '@/lib/kingdoms/rally-command';
import type { Mission } from '@/lib/kingdoms/types';
import { date, labels, number, type GameProps } from '../shared';
import { useViewClock } from '../use-view-clock';
import type { VillageNavigation } from '../building-panel';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import styles from './rally-panel.module.css';

export type RallyMission = Extract<Mission, 'attack' | 'scout' | 'reinforce'>;

type Props = GameProps & {
  onClose: () => void;
  onCampaign?: (mission: RallyMission) => void;
  onOpenTraining?: (target: Extract<VillageSelection, 'barracks' | 'stable'>) => void;
  onShowMap?: (villageId: string) => void;
  onNavigate?: (tab: VillageNavigation) => void;
};

function Arrival({ arrivesAt, now, label }: { arrivesAt: number; now: number; label: string }) {
  const remaining = remainingMs(arrivesAt, now);
  return (
    <span>
      {label}{' '}
      <time dateTime={new Date(arrivesAt).toISOString()}>
        <bdi>{formatCountdown(remaining)}</bdi>
        {' · '}
        {date(arrivesAt)}
      </time>
    </span>
  );
}

export function RallyPanel({
  view,
  village,
  onClose,
  onCampaign,
  onOpenTraining,
  onShowMap,
  onNavigate,
}: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  const command = presentRallyCommand(view, village);
  const deadline = Math.max(
    view.serverNow,
    ...command.outgoing.map((row) => row.arrivesAt),
    ...command.returning.map((row) => row.arrivesAt),
    ...command.attacks.map((row) => row.arrivesAt),
    ...command.incomingReinforcements.map((row) => row.arrivesAt),
    ...command.outgoingScouts.map((row) => row.arrivesAt),
    ...command.incomingScouts.map((row) => row.arrivesAt),
    village.training?.endsAt ?? 0,
  );
  const now = useViewClock(view, deadline, `rally:${village.id}`);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [village.id]);
  const trainingTarget = village.training?.unit === 'rider' ? 'stable' : 'barracks';
  return (
    <section
      className={styles.panel}
      aria-label="نقطة تجمع الجيوش"
      data-rally-panel
      data-readiness={command.readiness}
      dir="rtl"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>مركز القيادة العسكرية</p>
          <h2 ref={title} tabIndex={-1}>
            نقطة تجمع الجيوش
          </h2>
        </div>
        <Button variant="ghost" size="icon" aria-label="أغلق نقطة التجمع" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </Button>
      </header>
      <dl className={styles.overview}>
        <div>
          <dt>القرية</dt>
          <dd>{village.name}</dd>
        </div>
        <div>
          <dt>الحالة العسكرية</dt>
          <dd className={styles.status} role="status">
            {rallyReadinessLabels[command.readiness]}
          </dd>
        </div>
        <div>
          <dt>القوات المتاحة</dt>
          <dd>
            <bdi>{number(command.availableTotal)}</bdi>
          </dd>
        </div>
        <div>
          <dt>الحملات النشطة</dt>
          <dd>
            <bdi>{number(command.activeCampaigns)}</bdi>
          </dd>
        </div>
        <div>
          <dt>الهجمات القادمة</dt>
          <dd>
            <bdi>{number(command.attacks.length)}</bdi>
          </dd>
        </div>
        <div>
          <dt>أقرب تهديد</dt>
          <dd>
            {command.nearestThreat
              ? `${incomingMissionLabels[command.nearestThreat.mission]} · ${threatSeverityLabels[command.nearestThreat.severity]}`
              : 'لا تهديد'}
          </dd>
        </div>
      </dl>
      <div className={styles.actions}>
        <Button type="button" onClick={() => onCampaign?.('attack')} disabled={!onCampaign}>
          <Swords size={16} aria-hidden="true" /> إرسال جيش
        </Button>
        <Button type="button" variant="outline" onClick={() => onCampaign?.('scout')} disabled={!onCampaign}>
          <Binoculars size={16} aria-hidden="true" /> استطلاع
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onCampaign?.('reinforce')}
          disabled={!onCampaign}
        >
          <Shield size={16} aria-hidden="true" /> إرسال تعزيزات
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (onShowMap ? onShowMap(village.id) : onNavigate?.('map'))}
          disabled={!onShowMap && !onNavigate}
        >
          <Map size={16} aria-hidden="true" /> عرض الخريطة
        </Button>
      </div>
      <section className={styles.section} aria-label="الحامية">
        <h3>
          <Shield size={16} aria-hidden="true" /> الحامية
        </h3>
        {command.garrison.map((row) => (
          <p className={styles.row} key={row.unit}>
            <span>{row.name}</span>
            <bdi>{number(row.count)}</bdi>
            <span>{row.status}</span>
          </p>
        ))}
      </section>
      <section className={styles.section} aria-label="القوات المتاحة">
        <h3>
          <Swords size={16} aria-hidden="true" /> القوات المتاحة
        </h3>
        <p className={styles.muted}>
          المتاح للإرسال هو قوات القرية الحالية. أمر المسير يخصم منها مباشرة.
        </p>
        {command.available.map((row) => (
          <p className={styles.row} key={row.unit}>
            <span>{row.name}</span>
            <bdi>{number(row.count)}</bdi>
            <span>{row.status}</span>
          </p>
        ))}
      </section>
      <section className={styles.section} aria-label="الحملات الصادرة">
        <h3>
          <Flag size={16} aria-hidden="true" /> الحملات الصادرة
        </h3>
        {command.outgoing.length ? (
          command.outgoing.map((row) => (
            <article className={styles.row} key={row.id}>
              <strong>
                {row.missionLabel} · {row.place}
              </strong>
              {row.commanderName && <span>القائد {row.commanderName}</span>}
              <Arrival arrivesAt={row.arrivesAt} now={now} label="الوصول" />
              <span>{row.status}</span>
              {row.troops && (
                <span>
                  {row.troops
                    .filter((troop) => troop.count > 0)
                    .map((troop) => `${troop.name} ${number(troop.count)}`)
                    .join(' · ') || 'بلا قوات'}
                </span>
              )}
              {onShowMap && (
                <button type="button" onClick={() => onShowMap(row.mapVillageId ?? village.id)}>
                  عرض على الخريطة
                </button>
              )}
            </article>
          ))
        ) : (
          <p className={styles.muted}>لا حملات صادرة</p>
        )}
      </section>
      <section className={styles.section} aria-label="القوات العائدة">
        <h3>
          <Flag size={16} aria-hidden="true" /> القوات العائدة
        </h3>
        {command.returning.length ? (
          command.returning.map((row) => (
            <article className={styles.row} key={row.id}>
              <strong>العودة إلى {row.place}</strong>
              <Arrival arrivesAt={row.arrivesAt} now={now} label="الوصول" />
              <span>{row.missionLabel}</span>
              {row.troops && (
                <span>
                  {row.troops
                    .filter((troop) => troop.count > 0)
                    .map((troop) => `${troop.name} ${number(troop.count)}`)
                    .join(' · ')}
                </span>
              )}
              {row.loot &&
                (Object.entries(row.loot) as [keyof typeof row.loot, number][])
                  .filter(([, amount]) => amount > 0)
                  .map(([resource, amount]) => (
                    <span key={resource}>
                      {labels[resource]} <bdi>{number(amount)}</bdi>
                    </span>
                  ))}
            </article>
          ))
        ) : (
          <p className={styles.muted}>لا قوات عائدة</p>
        )}
      </section>
      <section className={styles.section} aria-label="الهجمات القادمة">
        <h3>
          <Swords size={16} aria-hidden="true" /> الهجمات القادمة
        </h3>
        {command.attacks.length ? (
          command.attacks.map((threat) => (
            <article className={styles.threat} key={threat.id} data-severity={threat.severity}>
              <strong>
                {incomingMissionLabels[threat.mission]} · {threatSeverityLabels[threat.severity]}
              </strong>
              {threat.source && <span>{threat.source.name}</span>}
              <Arrival arrivesAt={threat.arrivesAt} now={now} label="الوصول" />
              {onShowMap && (
                <button type="button" onClick={() => onShowMap(village.id)}>
                  عرض على الخريطة
                </button>
              )}
            </article>
          ))
        ) : (
          <p className={styles.muted}>لا هجمات قادمة</p>
        )}
      </section>
      <section className={styles.section} aria-label="التعزيزات">
        <h3>
          <Users size={16} aria-hidden="true" /> التعزيزات
        </h3>
        {command.incomingReinforcements.map((threat) => (
          <article className={styles.threat} key={threat.id} data-severity={threat.severity}>
            <strong>{incomingMissionLabels[threat.mission]}</strong>
            {threat.source && <span>{threat.source.name}</span>}
            <Arrival arrivesAt={threat.arrivesAt} now={now} label="الوصول" />
          </article>
        ))}
        {command.stationedReinforcements.map((row) => (
          <article className={styles.row} key={row.sourceId}>
            <strong>متمركزة · {row.name}</strong>
            <span>
              {row.troops
                .filter((troop) => troop.count > 0)
                .map((troop) => `${troop.name} ${number(troop.count)}`)
                .join(' · ')}
            </span>
          </article>
        ))}
        {!command.incomingReinforcements.length && !command.stationedReinforcements.length && (
          <p className={styles.muted}>لا تعزيزات قادمة أو متمركزة</p>
        )}
        <p className={styles.muted}>استدعاء الجيش أثناء المسير غير متاح. استدعاء التعزيزات المتمركزة يبقى من لوحة الجيش.</p>
      </section>
      <section className={styles.section} aria-label="الاستطلاع">
        <h3>
          <Binoculars size={16} aria-hidden="true" /> الاستطلاع
        </h3>
        {command.incomingScouts.map((threat) => (
          <article className={styles.threat} key={threat.id} data-severity={threat.severity}>
            <strong>{incomingMissionLabels[threat.mission]}</strong>
            {threat.source && <span>{threat.source.name}</span>}
            <Arrival arrivesAt={threat.arrivesAt} now={now} label="الوصول" />
          </article>
        ))}
        {command.outgoingScouts.map((row) => (
          <article className={styles.row} key={row.id}>
            <strong>
              {row.missionLabel} · {row.place}
            </strong>
            {row.commanderName && <span>القائد {row.commanderName}</span>}
            <Arrival arrivesAt={row.arrivesAt} now={now} label="الوصول" />
          </article>
        ))}
        {!command.incomingScouts.length && !command.outgoingScouts.length && (
          <p className={styles.muted}>لا استطلاع صادر أو قادم</p>
        )}
      </section>
      <section className={styles.section} aria-label="التدريب">
        <h3>
          <Swords size={16} aria-hidden="true" /> التدريب
        </h3>
        {command.training ? (
          <p>
            {number(command.training.count)} {view.config.units[command.training.unit].name}
            {' · '}
            <Arrival arrivesAt={command.training.endsAt} now={now} label="يكتمل" />
          </p>
        ) : (
          <p className={styles.muted}>لا تدريب جارٍ</p>
        )}
        {onOpenTraining && (
          <Button type="button" variant="outline" onClick={() => onOpenTraining(trainingTarget)}>
            الذهاب إلى التدريب
          </Button>
        )}
      </section>
      {command.commanders && (
        <section className={styles.section} aria-label="القادة">
          <h3>
            <Users size={16} aria-hidden="true" /> القادة
          </h3>
          {command.commanders.length ? (
            command.commanders.map((commander) => (
              <p className={styles.row} key={commander.id}>
                <span>{commander.name}</span>
                <span>{commanderStatusLabels[commander.status]}</span>
              </p>
            ))
          ) : (
            <p className={styles.muted}>لا قادة في المملكة</p>
          )}
        </section>
      )}
      <section className={styles.section} aria-label="التقارير العسكرية">
        <h3>
          <ScrollText size={16} aria-hidden="true" /> التقارير العسكرية
        </h3>
        {command.militaryReports.length ? (
          command.militaryReports.slice(0, 5).map((report) => <p key={report.id}>{report.title}</p>)
        ) : (
          <p className={styles.muted}>لا تقارير عسكرية</p>
        )}
        {onNavigate && (
          <Button type="button" variant="outline" onClick={() => onNavigate('reports')}>
            فتح التقارير
          </Button>
        )}
      </section>
    </section>
  );
}
