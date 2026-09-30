'use client';

import Image from 'next/image';
import { useState } from 'react';
import {
  ArrowLeft,
  Castle,
  Check,
  Crown,
  Flag,
  Hammer,
  ScrollText,
  Shield,
  Swords,
  Users,
} from 'lucide-react';
import { unitKeys, type Building } from '@/lib/kingdoms/types';
import { date, number, type GameProps } from './shared';
import { WorldMap } from './world-map';
import { VillageMap } from './village-map';
import { villageArt } from './village-layout';
import type { MapSelection } from './map-panel';
import styles from './kingdom-overview.module.css';

type OverviewTab = 'village' | 'army' | 'map' | 'alliances' | 'reports' | 'throne';

export function KingdomOverview({
  view,
  village,
  onNavigate,
  onOpenMap,
  onSelectBuilding,
}: Pick<GameProps, 'view' | 'village'> & {
  onNavigate: (tab: OverviewTab) => void;
  onOpenMap: (selection: MapSelection) => void;
  onSelectBuilding: (building: Building) => void;
}) {
  const [center, setCenter] = useState({ x: village.x, y: village.y });
  const [target, setTarget] = useState({ x: village.x, y: village.y });
  const [mapQuery, setMapQuery] = useState('');
  const troops = view.villages.reduce(
    (sum, item) => sum + unitKeys.reduce((count, unit) => count + item.troops[unit], 0),
    0,
  );
  const alliance = view.alliances.find((item) => item.id === view.player?.allianceId);
  const suggestedAlliance = view.alliances.find((item) => item.id !== alliance?.id);
  const matchingVillage = view.map.find((item) =>
    `${item.name} ${item.kingdomName}`.includes(mapQuery.trim()),
  );
  const activities = [
    ...(village.build
      ? [
          {
            id: 'build',
            text: `يُطوَّر ${view.config.buildings[village.build.building].name} إلى المستوى ${number(village.build.level)}`,
            at: village.build.endsAt,
            icon: Hammer,
          },
        ]
      : []),
    ...(village.training
      ? [
          {
            id: 'training',
            text: `يتدرب ${number(village.training.count)} ${view.config.units[village.training.unit].name}`,
            at: village.training.endsAt,
            icon: Swords,
          },
        ]
      : []),
    ...view.movements.slice(0, 2).map((movement) => ({
      id: movement.id,
      text:
        movement.mission === 'gather'
          ? `جمع موارد من (${movement.targetX}, ${movement.targetY})`
          : movement.mission === 'return' && movement.gather
            ? `عودة جيش الجمع إلى (${movement.targetX}, ${movement.targetY})`
            : `حملة ${movement.mission === 'attack' ? 'هجوم' : movement.mission === 'scout' ? 'استطلاع' : 'متجهة'} إلى (${movement.targetX}, ${movement.targetY})`,
      at: movement.arrivesAt,
      icon: Flag,
    })),
    ...view.reports
      .slice(-3)
      .reverse()
      .map((report) => ({
        id: report.id,
        text: report.title,
        at: report.at,
        icon: ScrollText,
      })),
  ].slice(0, 5);
  const tasks = [
    {
      name: 'طوّر مباني قريتك',
      done: view.player?.claims.includes('builder') ?? false,
      tab: 'village' as const,
    },
    {
      name: 'جهّز عشر وحدات في إحدى قراك',
      done: view.player?.claims.includes('commander') ?? false,
      tab: 'army' as const,
    },
    {
      name: 'أسّس قرية ثانية',
      done: view.player?.claims.includes('founder') ?? false,
      tab: 'map' as const,
    },
  ];

  return (
    <div className={styles.overview}>
      <section className={styles.hero} aria-labelledby="kingdom-overview-title">
        <Image
          src={villageArt.src}
          alt=""
          fill
          priority
          sizes="(max-width: 700px) 100vw, 1200px"
          className={styles.heroImage}
        />
        <div className={styles.heroContent}>
          <p className={styles.kicker}>
            عالم {view.worldName} · الموسم {number(view.season.number)}
          </p>
          <h2 id="kingdom-overview-title">{view.player?.name}</h2>
          <p>مملكتك.. مجدك.. إرثك. ابنِ قرْيتك ووسّع نفوذك عبر عالم تحدي.</p>
          <div className={styles.heroActions}>
            <button
              type="button"
              className={styles.goldButton}
              onClick={() => onNavigate('village')}
            >
              إدارة القرية <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => onNavigate('map')}
            >
              استكشف العالم
            </button>
          </div>
        </div>
      </section>

      <VillageMap view={view} village={village} selected="hall" onSelect={onSelectBuilding} />
      <section className={styles.stats} aria-label="ملخص المملكة">
        <article className={styles.stat}>
          <Castle aria-hidden="true" />
          <span>مستوى دار الحكم</span>
          <strong>{number(village.buildings.hall)}</strong>
          <small>{village.name}</small>
        </article>
        <article className={styles.stat}>
          <Users aria-hidden="true" />
          <span>القرى التابعة</span>
          <strong>{number(view.villages.length)}</strong>
          <small>من أصل {number(view.config.maxVillages)} قرى ممكنة</small>
        </article>
        <article className={styles.stat}>
          <Swords aria-hidden="true" />
          <span>الوحدات الجاهزة</span>
          <strong>{number(troops)}</strong>
          <small>في جميع قراك</small>
        </article>
        <article className={styles.stat}>
          <Crown aria-hidden="true" />
          <span>رصيد العرش</span>
          <strong>{number(view.player?.throne ?? 0)}</strong>
          <small>نقاط الموسم الحالي</small>
        </article>
      </section>

      <section className={styles.mapCard} aria-label="خريطة المملكة">
        <div className={styles.mapToolbar}>
          <div>
            <p className={styles.kicker}>الأطلس الملكي</p>
            <h2>خريطة المملكة</h2>
          </div>
          <form
            role="search"
            className={styles.mapSearch}
            onSubmit={(event) => {
              event.preventDefault();
              if (matchingVillage) {
                setCenter({ x: matchingVillage.x, y: matchingVillage.y });
                setTarget({ x: matchingVillage.x, y: matchingVillage.y });
              }
            }}
          >
            <label htmlFor="kingdom-overview-search">ابحث عن قرية أو مملكة</label>
            <div>
              <input
                id="kingdom-overview-search"
                type="search"
                value={mapQuery}
                onChange={(event) => setMapQuery(event.target.value)}
                placeholder="اسم القرية أو المملكة"
              />
              <button type="submit" aria-label="ابحث في الخريطة" disabled={!mapQuery.trim()}>
                انتقال
              </button>
            </div>
          </form>
        </div>
        {mapQuery.trim() && !matchingVillage && (
          <p className={styles.mapFeedback} role="status">
            لا قرى تطابق البحث.
          </p>
        )}
        <WorldMap
          center={center}
          target={target}
          origin={village}
          radius={view.config.worldRadius}
          playerId={view.player?.id}
          villages={view.map}
          territories={view.territories}
          resourceSites={view.resourceSites}
          onCenter={setCenter}
          onSelect={setTarget}
        />
        <div className={styles.mapFooter}>
          <span>
            الموضع المختار{' '}
            <bdi dir="ltr">
              ({target.x}, {target.y})
            </bdi>
          </span>
          <button type="button" onClick={() => onOpenMap({ center, target })}>
            افتح خريطة العالم <ArrowLeft size={16} aria-hidden="true" />
          </button>
        </div>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.infoCard} aria-labelledby="overview-tasks-title">
          <div className={styles.cardHeading}>
            <h2 id="overview-tasks-title">
              <Shield size={20} aria-hidden="true" /> المهام
            </h2>
            <button type="button" onClick={() => onNavigate('reports')}>
              عرض الكل
            </button>
          </div>
          <div className={styles.taskList}>
            {tasks.map((task) => (
              <button key={task.name} type="button" onClick={() => onNavigate(task.tab)}>
                <span className={styles.taskCheck} data-done={task.done} aria-hidden="true">
                  {task.done && <Check size={14} />}
                </span>
                <span>{task.name}</span>
                <span className={styles.taskStatus}>{task.done ? 'استُلمت' : 'لم تُستلم'}</span>
              </button>
            ))}
          </div>
        </section>
        <section className={styles.infoCard} aria-labelledby="overview-events-title">
          <div className={styles.cardHeading}>
            <h2 id="overview-events-title">
              <ScrollText size={20} aria-hidden="true" /> مستجدات المملكة
            </h2>
            <button type="button" onClick={() => onNavigate('reports')}>
              عرض الكل
            </button>
          </div>
          {activities.length ? (
            <ul className={styles.events}>
              {activities.map((item) => (
                <li key={item.id}>
                  <item.icon size={18} aria-hidden="true" />
                  <span>{item.text}</span>
                  <time dateTime={new Date(item.at).toISOString()}>{date(item.at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>لا أحداث بعد. ابدأ بتطوير قريتك أو تدريب وحداتك.</p>
          )}
        </section>
        <section className={styles.infoCard} aria-labelledby="overview-alliance-title">
          <div className={styles.cardHeading}>
            <h2 id="overview-alliance-title">
              <Flag size={20} aria-hidden="true" /> التحالفات
            </h2>
            <button type="button" onClick={() => onNavigate('alliances')}>
              عرض الكل
            </button>
          </div>
          <div className={styles.allianceContent}>
            <span className={styles.allianceCrest} aria-hidden="true">
              <Crown size={38} />
            </span>
            <div>
              <strong>{alliance?.name ?? suggestedAlliance?.name ?? 'كوّن عهدك'}</strong>
              <p>
                {alliance
                  ? `${number(Object.keys(alliance.members).length)} أعضاء في تحالفك`
                  : suggestedAlliance
                    ? `${number(Object.keys(suggestedAlliance.members).length)} أعضاء · يمكنك طلب الانضمام`
                    : 'لا تحالفات في هذا العالم بعد'}
              </p>
              {view.allianceEvent && (
                <p>
                  {view.allianceEvent.title} · {number(view.allianceEvent.points)} من{' '}
                  {number(view.allianceEvent.target)} نقطة
                </p>
              )}
              <button
                type="button"
                className={styles.goldButton}
                onClick={() => onNavigate('alliances')}
              >
                {view.allianceEvent
                  ? 'افتح الميثاق الأسبوعي'
                  : alliance
                    ? 'إدارة التحالف'
                    : 'استعرض التحالفات'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
