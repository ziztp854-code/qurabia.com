'use client';

import { Hammer, Shield, Swords } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { buildingPercent, buildingStage, supremeStage } from '@/lib/kingdoms/stages';
import { resourceKeys, unitKeys, type Building, type Resources } from '@/lib/kingdoms/types';
import { CommandForm, ResourceText, date, labels, number, value, type GameProps } from './shared';
import styles from './kingdoms.module.css';
import { StageLadder } from './stage-ladder';
import { VillageMap } from './village-map';

export function VillagePanel({ view, village, busy, send }: GameProps) {
  const [selected, setSelected] = useState<Building>('hall');
  return (
    <div className={styles.villageLayout}>
      <div className={styles.villageColumn}>
        <StageLadder view={view} village={village} />
        <VillageMap view={view} village={village} selected={selected} onSelect={setSelected} />
      </div>
      <aside className={styles.buildingRail} aria-label="إدارة مباني القرية">
        {[selected].map((key) => {
          const building = view.config.buildings[key];
          const level = village.buildings[key];
          const stage = buildingStage(level, building.maxLevel);
          const percent = buildingPercent(level, building.maxLevel);
          const cost = Object.fromEntries(
            Object.entries(building.cost).map(([resource, amount]) => [
              resource,
              Math.ceil(amount * building.growth ** level),
            ]),
          ) as Resources;
          return (
            <article className={`${styles.panel} ${styles.buildingDetails}`} key={key}>
              <p className={styles.eyebrow}>المبنى المختار</p>
              <div className={styles.row}>
                <h3>{building.name}</h3>
                <span>
                  مستوى {number(level)} من {number(building.maxLevel)}
                </span>
              </div>
              <div className={styles.buildingStage} data-stage={stage?.key ?? 'unbuilt'}>
                <div className={styles.row}>
                  <strong>{stage ? stage.name : 'لم يُبنَ بعد'}</strong>
                  <span className={styles.cost}>{number(percent)}٪ من الحد الأعلى</span>
                </div>
                <span
                  role="progressbar"
                  aria-label={`تقدم ${building.name} نحو ${supremeStage.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-valuetext={`${number(percent)}٪ من الحد الأعلى للمبنى`}
                  className={styles.stageTrack}
                >
                  <span style={{ width: `${percent}%` }} />
                </span>
                <p className={styles.cost}>
                  {stage?.key === supremeStage.key
                    ? `المبنى في ${supremeStage.name}. ${supremeStage.tagline}`
                    : `المرحلة العليا للمبنى تبدأ عند ${number(
                        Math.round(supremeStage.fraction * building.maxLevel),
                      )} مستوى.`}
                </p>
              </div>
              <ul className={styles.buildingCosts} aria-label="تكلفة التطوير">
                {resourceKeys.map((resource) => (
                  <li key={resource}>
                    <span>{labels[resource]}</span>
                    <bdi>{number(cost[resource])}</bdi>
                  </li>
                ))}
              </ul>
              <p className={styles.muted}>
                مدة التطوير الأساسية:{' '}
                {number(Math.ceil(building.seconds * building.growth ** level))} ثانية
              </p>
              <Button
                disabled={busy || !!village.build || level >= building.maxLevel}
                onClick={() => void send({ type: 'build', villageId: village.id, building: key })}
              >
                {level >= building.maxLevel ? 'بلغ الحد الأعلى' : 'طوّر المبنى'}
              </Button>
            </article>
          );
        })}
        <section className={styles.queueBoard} aria-label="قوائم التنفيذ">
          <div className={styles.queueItem}>
            <Hammer size={22} aria-hidden="true" />
            <div>
              <h3>قائمة البناء</h3>
              {village.build ? (
                <>
                  <p>
                    {view.config.buildings[village.build.building].name} · المستوى{' '}
                    {number(village.build.level)}
                  </p>
                  <time dateTime={new Date(village.build.endsAt).toISOString()}>
                    يكتمل {date(village.build.endsAt)}
                  </time>
                </>
              ) : (
                <p>لا بناء قيد التنفيذ</p>
              )}
            </div>
          </div>
          <div className={styles.queueItem}>
            <Swords size={22} aria-hidden="true" />
            <div>
              <h3>قائمة التدريب</h3>
              {village.training ? (
                <>
                  <p>
                    {number(village.training.count)} {view.config.units[village.training.unit].name}
                  </p>
                  <time dateTime={new Date(village.training.endsAt).toISOString()}>
                    يكتمل {date(village.training.endsAt)}
                  </time>
                </>
              ) : (
                <p>لا وحدات قيد التدريب</p>
              )}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

export function ArmyPanel({ view, village, busy, send }: GameProps) {
  return (
    <div className={styles.stack}>
      <div className={styles.notice}>
        <Shield aria-hidden="true" size={18} /> تحتاج إلى ثكنة لتدريب الجنود، ويحتاج المستوطن إلى
        دار حكم مستوى {number(view.config.settlerHallLevel)}.{' '}
        {village.training && (
          <>
            يتدرب الآن {number(village.training.count)}{' '}
            {view.config.units[village.training.unit].name} حتى {date(village.training.endsAt)}.
          </>
        )}
      </div>
      <div className={styles.grid}>
        {unitKeys.map((key) => {
          const unit = view.config.units[key];
          return (
            <article className={styles.panel} key={key}>
              <h3>
                {unit.name}{' '}
                <small className={styles.muted}>· {number(village.troops[key])} جاهز</small>
              </h3>
              <p>
                <ResourceText resources={unit.cost} />
              </p>
              <p className={styles.cost}>
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
                <span className={styles.cost}>
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
      <section className={styles.panel}>
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
          <p className={styles.muted}>لا تعزيزات متمركزة هنا.</p>
        )}
      </section>
      <section className={styles.panel}>
        <h2>استدعاء التعزيزات</h2>
        <p className={styles.muted}>
          اختر القرية التي أرسلت إليها تعزيزات لإعادتها إلى قريتك الحالية.
        </p>
        <div className={styles.grid}>
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
