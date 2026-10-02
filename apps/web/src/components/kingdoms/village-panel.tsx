'use client';

import { Castle, Hammer, Map, ScrollText, Shield, Swords } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { resourceKeys, unitKeys, type Resources } from '@/lib/kingdoms/types';
import type { VillageSelection } from '@/lib/kingdoms/village/types';
import { CommandForm, ResourceText, date, number, value, type GameProps } from './shared';
import { StageLadder } from './stage-ladder';
import { UnitIcon } from './unit-icon';
import { VillageHero } from './village-hero';
import { BuildingPanel, type VillageNavigation } from './building-panel';
import { VillageMap } from './village-map';
import { StablePanel } from './village/stable-panel';
import { CommanderPanel } from './commander-panel';
import kingdomsStyles from './kingdoms.module.css';
import styles from './village.module.css';
import villageStyles from './village-panel.module.css';

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
}: GameProps & {
  initialBuilding?: VillageSelection | null;
  onNavigate?: (tab: VillageNavigation) => void;
}) {
  const [selected, setSelected] = useState<VillageSelection | null>(initialBuilding);
  const returnFocus = useRef<HTMLElement | null>(null);
  const select = (building: VillageSelection) => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setSelected(building);
  };
  const close = () => {
    setSelected(null);
    returnFocus.current?.focus({ preventScroll: true });
  };
  const totalTroops = unitKeys.reduce((sum, unit) => sum + village.troops[unit], 0);
  return (
    <div className={styles.village}>
      <div
        className={villageStyles.layout}
        data-selected={selected !== null}
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
          />
        </div>
        {selected && (
          <aside className={villageStyles.rail} aria-label="إدارة مباني القرية">
            {selected === 'stable' ? (
              <StablePanel
                view={view}
                village={village}
                busy={busy}
                send={send}
                onClose={close}
                onSelectBarracks={() => setSelected('barracks')}
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
          </aside>
        )}
        <section
          className={`${styles.card} ${styles.queue} ${villageStyles.queues}`}
          aria-label="قوائم التنفيذ"
        >
          <div className={styles.queueItem}>
            <span className={styles.queueIcon} aria-hidden="true">
              <Hammer size={16} />
            </span>
            <div className={styles.queueBody}>
              <h3>قائمة البناء</h3>
              {village.build &&
                (() => {
                  const current = village.build;
                  const name = view.config.buildings[current.building].name;
                  const progress =
                    current.startedAt !== undefined && current.endsAt > current.startedAt
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(
                              ((view.serverNow - current.startedAt) /
                                (current.endsAt - current.startedAt)) *
                                100,
                            ),
                          ),
                        )
                      : null;
                  return (
                    <>
                      <p>
                        {name} · المستوى {number(current.level)}
                      </p>
                      <time dateTime={new Date(current.endsAt).toISOString()}>
                        يكتمل {date(current.endsAt)}
                      </time>
                      {selected !== current.building && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => select(current.building)}
                        >
                          حدّده في المشهد
                        </button>
                      )}
                      {progress !== null && (
                        <span
                          role="progressbar"
                          aria-label={`تقدم قائمة بناء ${name}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress}
                          aria-valuetext={`${number(progress)}٪ من مدة البناء`}
                          className={styles.bar}
                        >
                          <span style={{ width: `${progress}%` }} />
                        </span>
                      )}
                    </>
                  );
                })()}
              {!village.build && <p className={styles.queueEmpty}>لا بناء قيد التنفيذ</p>}
            </div>
          </div>
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
              ) : (
                <p className={styles.queueEmpty}>لا وحدات قيد التدريب</p>
              )}
            </div>
          </div>
        </section>
        <nav aria-label="التنقل من القرية" className={villageStyles.navigation}>
          <button type="button" aria-label="عرض القرية" aria-pressed={!selected} onClick={close}>
            <Castle size={20} aria-hidden="true" />
            <span>القرية</span>
          </button>
          <button type="button" aria-pressed={!!selected} onClick={() => select('hall')}>
            <Hammer size={20} aria-hidden="true" />
            <span>البناء</span>
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
            aria-label="افتح المهام"
            disabled={!onNavigate}
            onClick={() => onNavigate?.('reports')}
          >
            <ScrollText size={20} aria-hidden="true" />
            <span>المهام</span>
          </button>
          <button
            type="button"
            aria-label="انتقل إلى خريطة العالم"
            disabled={!onNavigate}
            onClick={() => onNavigate?.('map')}
          >
            <Map size={20} aria-hidden="true" />
            <span>خريطة العالم</span>
          </button>
        </nav>
      </div>
      <VillageHero view={view} village={village} />
      <StageLadder view={view} village={village} />
      <section className={styles.card} aria-label="وحدات القرية">
        <p className={styles.cardEyebrow}>تشكيل القرية</p>
        <div className={styles.cardHead}>
          <Swords size={18} aria-hidden="true" />
          <div>
            <h3 className={styles.cardTitle}>وحدات القرية</h3>
            <p className={styles.cardMeta}>
              <span>{number(totalTroops)} جندي جاهز في القرية</span>
            </p>
          </div>
        </div>
        <div className={styles.units}>
          {unitKeys.map((key) => {
            const unit = view.config.units[key];
            const affordable = maxAffordable(village.resources, unit.cost);
            return (
              <article className={`${styles.card} ${styles.unitCard}`} key={key}>
                <div className={styles.cardHead}>
                  <span className={styles.medallion} aria-hidden="true">
                    <UnitIcon size={18} unit={key} />
                  </span>
                  <div>
                    <h3 className={styles.cardTitle}>{unit.name}</h3>
                    <p className={styles.cardMeta}>
                      <span>{number(village.troops[key])} جاهز</span>
                    </p>
                  </div>
                </div>
                <div className={styles.unitStats}>
                  <span className={styles.unitStat}>
                    هجوم <b>{number(unit.attack)}</b>
                  </span>
                  <span className={styles.unitStat}>
                    دفاع <b>{number(unit.defense)}</b>
                  </span>
                  <span className={styles.unitStat}>
                    حمولة <b>{number(unit.carry)}</b>
                  </span>
                  <span className={styles.unitStat}>
                    غذاء <b>{number(unit.upkeep)}/ساعة</b>
                  </span>
                </div>
                <p className={styles.cardMeta}>
                  <span>
                    <ResourceText resources={unit.cost} />
                  </span>
                </p>
                <p className={styles.cardMeta}>
                  <span>
                    الحد الأقصى بمواردك الآن:{' '}
                    {Number.isFinite(affordable) ? number(affordable) : 'غير محدود بالموارد'}
                  </span>
                </p>
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
                  <span className={styles.cardMeta}>
                    <span>
                      مدة الوحدة:{' '}
                      {number(
                        Math.ceil(
                          unit.seconds /
                            (1 +
                              Math.max(0, village.buildings.barracks - 1) *
                                view.config.barracksSpeedPerLevel),
                        ),
                      )}{' '}
                      ثانية
                    </span>
                  </span>
                </CommandForm>
              </article>
            );
          })}
        </div>
        <p className={styles.cardMeta}>
          <span>
            تحتاج إلى ثكنة لتدريب الجنود، ويحتاج المستوطن إلى دار حكم مستوى{' '}
            {number(view.config.settlerHallLevel)}.
          </span>
        </p>
      </section>
      <section className={styles.card} aria-label="التعزيزات في القرية">
        <p className={styles.cardEyebrow}>حامية القرية</p>
        <div className={styles.cardHead}>
          <Shield size={18} aria-hidden="true" />
          <h3 className={styles.cardTitle}>التعزيزات في القرية</h3>
        </div>
        {Object.entries(village.reinforcements).length ? (
          <ul className={styles.list}>
            {Object.entries(village.reinforcements).map(([owner, troops]) => (
              <li key={owner} className={styles.listRow}>
                <strong>
                  {view.map.find((source) => source.id === owner)?.kingdomName ?? 'مملكة'}
                </strong>
                <span>
                  {unitKeys
                    .map((unit) => `${view.config.units[unit].name} ${number(troops[unit])}`)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.listEmpty}>لا تعزيزات متمركزة هنا.</p>
        )}
      </section>
      <section className={styles.card} aria-label="استدعاء التعزيزات">
        <div className={styles.cardHead}>
          <Swords size={18} aria-hidden="true" />
          <h3 className={styles.cardTitle}>استدعاء التعزيزات</h3>
        </div>
        <p className={styles.cardMeta}>
          <span>اختر القرية التي أرسلت إليها تعزيزات لإعادتها إلى قريتك الحالية.</span>
        </p>
        <div className={styles.actions}>
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

export function ArmyPanel({ view, village, busy, send }: GameProps) {
  return (
    <div className={kingdomsStyles.stack}>
      <CommanderPanel view={view} village={village} busy={busy} send={send} />
      <div className={kingdomsStyles.notice}>
        <Shield aria-hidden="true" size={18} /> تحتاج إلى ثكنة لتدريب الجنود، ويحتاج المستوطن إلى
        دار حكم مستوى {number(view.config.settlerHallLevel)}.{' '}
        {village.training && (
          <>
            يتدرب الآن {number(village.training.count)}{' '}
            {view.config.units[village.training.unit].name} حتى {date(village.training.endsAt)}.
          </>
        )}
      </div>
      <div className={kingdomsStyles.grid}>
        {unitKeys.map((key) => {
          const unit = view.config.units[key];
          return (
            <article className={kingdomsStyles.panel} key={key}>
              <h3>
                {unit.name}{' '}
                <small className={kingdomsStyles.muted}>· {number(village.troops[key])} جاهز</small>
              </h3>
              <p>
                <ResourceText resources={unit.cost} />
              </p>
              <p className={kingdomsStyles.cost}>
                هجوم {number(unit.attack)} · دفاع {number(unit.defense)} · حمولة{' '}
                {number(unit.carry)} · غذاء {number(unit.upkeep)}/ساعة
              </p>
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
                    Math.ceil(
                      unit.seconds /
                        (1 +
                          Math.max(0, village.buildings.barracks - 1) *
                            view.config.barracksSpeedPerLevel),
                    ),
                  )}{' '}
                  ثانية
                </span>
              </CommandForm>
            </article>
          );
        })}
      </div>
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
