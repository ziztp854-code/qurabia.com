'use client';

import { Castle, Flag, Hammer, Map, ScrollText, Shield, Swords } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { trainingBuilding, trainingDurationMs } from '@/lib/kingdoms/training';
import { resourceKeys, unitKeys, type Resources, type Unit } from '@/lib/kingdoms/types';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import { CommandForm, ResourceText, date, number, value, type GameProps } from './shared';
import { BuildingPanel, type VillageNavigation } from './building-panel';
import { VillageMap } from './village-map';
import { ConstructionQueue } from './village/construction-queue';
import { StablePanel } from './village/stable-panel';
import { RallyPanel, type RallyMission } from './village/rally-panel';
import { CommanderPanel } from './commander-panel';
import { VillageDetailSheet } from './village/village-detail-sheet';
import kingdomsStyles from './kingdoms.module.css';
import styles from './village.module.css';
import villageStyles from './village-panel.module.css';

function trainSeconds(unitSeconds: number, level: number, speedPerLevel: number) {
  return Math.ceil(trainingDurationMs(unitSeconds, 1, level, speedPerLevel) / 1000);
}

function maxAffordable(have: Resources, cost: Resources) {
  const limits = resourceKeys
    .filter((resource) => cost[resource] > 0)
    .map((resource) => Math.floor(Math.floor(have[resource]) / cost[resource]));
  return limits.length ? Math.max(0, Math.min(...limits)) : Infinity;
}

export function VillagePanel({
  view,
  village,
  busy,
  send,
  initialBuilding = null,
  onNavigate,
  onShowMap,
  onRefresh,
  onCampaign,
  hideMobileNavigation = false,
}: GameProps & {
  initialBuilding?: VillageSelection | null;
  onNavigate?: (tab: VillageNavigation) => void;
  onShowMap?: (villageId: string) => void;
  onRefresh?: () => void;
  onCampaign?: (mission: RallyMission) => void;
  hideMobileNavigation?: boolean;
}) {
  const [selected, setSelected] = useState<VillageSelection | null>(initialBuilding);
  const returnFocus = useRef<HTMLElement | null>(null);
  const pendingBuilds =
    village.constructionQueue?.filter(
      (item) => item.status === 'BUILDING' || item.status === 'QUEUED',
    ).length ?? 0;
  const pendingJobs = (pendingBuilds || (village.build ? 1 : 0)) + (village.training ? 1 : 0);
  const select = (building: VillageSelection) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setSelected(building);
  };
  const selectQueuedBuilding = () => {
    if (village.build) select(village.build.building);
  };
  const close = () => {
    setSelected(null);
    returnFocus.current?.focus({ preventScroll: true });
  };
  return (
    <div className={styles.village} data-village-screen="">
      <div
        className={villageStyles.layout}
        data-selected={selected !== null}
        data-hide-mobile-navigation={hideMobileNavigation}
        data-sheet={selected === null ? undefined : selected === 'rally' ? 'rally' : 'building'}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && selected) close();
        }}
      >
        <div className={villageStyles.scene}>
          <VillageMap
            view={view}
            village={village}
            selected={selected}
            onSelect={select}
            onWorldMap={onNavigate ? () => onNavigate('map') : undefined}
            onShowMap={onShowMap}
            onRefresh={onRefresh}
          />
        </div>
        {selected && (
          <VillageDetailSheet key={selected} onClose={close} panel={selected === 'rally' ? 'rally' : undefined}>
            {selected === 'rally' ? (
              <RallyPanel
                view={view}
                village={village}
                busy={busy}
                send={send}
                onClose={close}
                onCampaign={onCampaign}
                onOpenTraining={(target) => setSelected(target)}
                onShowMap={onShowMap}
                onNavigate={onNavigate}
              />
            ) : selected === 'stable' ? (
              <StablePanel
                view={view}
                village={village}
                busy={busy}
                send={send}
                onClose={close}
                onNavigate={onNavigate}
              />
            ) : (
              <BuildingPanel
                key={selected}
                building={selected}
                view={view}
                village={village}
                busy={busy}
                send={send}
                onClose={close}
                onNavigate={onNavigate}
              />
            )}
          </VillageDetailSheet>
        )}
        <details className={villageStyles.queueDrawer}>
          <summary>
            <Hammer size={16} aria-hidden="true" />
            البناء والتدريب<bdi>{number(pendingJobs)}</bdi>
          </summary>
          <section
            className={`${styles.card} ${styles.queue} ${villageStyles.queues}`}
            aria-label="قوائم التنفيذ"
          >
            <div className={styles.queueItem}>
              <span className={styles.queueIcon} aria-hidden="true">
                <Hammer size={16} />
              </span>
              <div className={styles.queueBody}>
                <ConstructionQueue view={view} village={village} busy={busy} send={send} />
                {village.build && selected !== village.build.building && (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={selectQueuedBuilding}
                  >
                    حدّده في المشهد
                  </button>
                )}
              </div>
            </div>
            {village.training && (
              <div className={styles.queueItem}>
                <span className={styles.queueIcon} aria-hidden="true">
                  <Swords size={16} />
                </span>
                <div className={styles.queueBody}>
                  <h3>قائمة التدريب</h3>
                  {village.training ? (
                    <>
                      <p>
                        {number(village.training.count)}{' '}
                        {view.config.units[village.training.unit].name}
                      </p>
                      <time dateTime={new Date(village.training.endsAt).toISOString()}>
                        يكتمل {date(village.training.endsAt)}
                      </time>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </details>
        <nav aria-label="التنقل من القرية" className={villageStyles.navigation}>
          <button type="button" aria-label="عرض القرية" aria-pressed={!selected} onClick={close}>
            <Castle size={20} aria-hidden="true" />
            <span>القرية</span>
          </button>
          <button
            type="button"
            aria-label="انتقل إلى خريطة العالم"
            disabled={!onNavigate}
            onClick={() => onNavigate?.('map')}
          >
            <Map size={20} aria-hidden="true" />
            <span>العالم</span>
          </button>
          <button
            type="button"
            aria-label="انتقل إلى الجيش"
            disabled={!onNavigate}
            onClick={() => onNavigate?.('army')}
          >
            <Swords size={20} aria-hidden="true" />
            <span>الجيش</span>
          </button>
          <button
            type="button"
            aria-label="افتح التقارير"
            disabled={!onNavigate}
            onClick={() => onNavigate?.('reports')}
          >
            <ScrollText size={20} aria-hidden="true" />
            <span>التقارير</span>
          </button>
          <button
            type="button"
            aria-label="انتقل إلى التحالف"
            disabled={!onNavigate}
            onClick={() => onNavigate?.('alliances')}
          >
            <Flag size={20} aria-hidden="true" />
            <span>التحالف</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export function ArmyPanel({ view, village, busy, send }: GameProps) {
  return (
    <div className={kingdomsStyles.stack}>
      <CommanderPanel view={view} village={village} busy={busy} send={send} />
      <div className={kingdomsStyles.notice}>
        <Shield aria-hidden="true" size={18} /> الحراس والكشافة والمستوطنون من الثكنة، والفرسان من
        الإسطبل. المستوطن يحتاج دار حكم مستوى {number(view.config.settlerHallLevel)}.{' '}
        {village.training && (
          <>
            يتدرب الآن {number(village.training.count)}{' '}
            {view.config.units[village.training.unit].name} حتى {date(village.training.endsAt)}.
          </>
        )}
      </div>
      <section aria-label="وحدات القرية">
        <div className={kingdomsStyles.grid}>
          {unitKeys.map((key) => {
            const unit = view.config.units[key];
            const affordable = maxAffordable(village.resources, unit.cost);
            return (
              <article className={kingdomsStyles.panel} key={key}>
                <h3>{unit.name}</h3>
                <p className={kingdomsStyles.muted}>{number(village.troops[key])} جاهز</p>
                <p className={kingdomsStyles.cost}>
                  الحد الأقصى بمواردك الآن:{' '}
                  {Number.isFinite(affordable) ? number(affordable) : 'غير محدود بالموارد'}
                </p>
                <p>
                  <ResourceText resources={unit.cost} />
                </p>
                <p className={kingdomsStyles.cost}>
                  هجوم {number(unit.attack)} · دفاع {number(unit.defense)} · حمولة{' '}
                  {number(unit.carry)} · غذاء {number(unit.upkeep)}/ساعة
                </p>
                {key === 'rider' ? (
                  <p className={kingdomsStyles.muted}>تدريب الفرسان من الإسطبل.</p>
                ) : (
                  <CommandForm
                    busy={busy || !!village.training}
                    label="درّب الوحدات"
                    onSubmit={(form) =>
                      void send({
                        type: 'train',
                        villageId: village.id,
                        unit: key,
                        count: value(form, 'count'),
                      })
                    }
                  >
                    <Input
                      label={`عدد ${unit.name}`}
                      name="count"
                      type="number"
                      min="1"
                      max="10000"
                      defaultValue="1"
                      required
                      dir="ltr"
                    />
                    <span className={kingdomsStyles.cost}>
                      مدة الوحدة:{' '}
                      {number(
                        trainSeconds(
                          unit.seconds,
                          village.buildings[trainingBuilding(key as Unit)],
                          view.config.barracksSpeedPerLevel,
                        ),
                      )}{' '}
                      ثانية
                    </span>
                  </CommandForm>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <section className={kingdomsStyles.panel}>
        <h2>التعزيزات في القرية</h2>
        {Object.entries(village.reinforcements).length ? (
          Object.entries(village.reinforcements).map(([owner, troops]) => (
            <p key={owner}>
              {view.map.find((source) => source.id === owner)?.kingdomName ?? 'مملكة'}:{' '}
              {unitKeys
                .map((unit) => `${view.config.units[unit].name} ${number(troops[unit])}`)
                .join(' · ')}
            </p>
          ))
        ) : (
          <p className={kingdomsStyles.muted}>لا تعزيزات متمركزة هنا.</p>
        )}
      </section>
      <section className={kingdomsStyles.panel}>
        <h2>استدعاء التعزيزات</h2>
        <p className={kingdomsStyles.muted}>
          اختر القرية التي أرسلت إليها تعزيزات لإعادتها إلى قريتك الحالية.
        </p>
        <div className={kingdomsStyles.grid}>
          {view.map
            .filter(
              (target) =>
                target.id !== village.id &&
                (target.ownerId === view.player?.id ||
                  (!!view.player?.allianceId && target.allianceId === view.player.allianceId)),
            )
            .map((target) => (
              <Button
                key={target.id}
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void send({ type: 'recall', villageId: village.id, hostVillageId: target.id })
                }
              >
                استدعِ من {target.name} ({target.x}, {target.y})
              </Button>
            ))}
        </div>
      </section>
    </div>
  );
}
