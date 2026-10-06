'use client';

import { trainingBuilding, trainingDurationMs } from '@/lib/kingdoms/training';
import { CommanderPanel } from '../commander-panel';
import { RallyPanel, type RallyMission } from './rally-panel';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import {
  resourceKeys,
  unitKeys,
  type Building,
  type Unit,
} from '@/lib/kingdoms/types';
import { BuildingPanel, type VillageNavigation } from '../building-panel';
import { MarketPanel } from '../social-panel';
import { date, number, ResourceText, type GameProps } from '../shared';
import { StablePanel } from './stable-panel';
import { SiegeWorkshopPanel } from './siege-workshop-panel';
import type { CitySceneKey } from './city-scenes';
import styles from './facility-scene-content.module.css';

export type FacilitySceneContentProps = GameProps & {
  scene: CitySceneKey;
  onClose: () => void;
  onSelectScene: (scene: CitySceneKey) => void;
  onNavigate?: (tab: VillageNavigation) => void;
  onRefresh?: () => void;
  onShowMap?: (villageId: string) => void;
  onCampaign?: (mission: RallyMission) => void;
};

export function FacilitySceneContent(props: FacilitySceneContentProps) {
  const { scene, onClose, onNavigate, onSelectScene } = props;
  const gameplay = {
    ...props,
    busy: props.busy || props.view.paused || props.view.season.status === 'ended',
  };
  if (scene === 'stable')
    return (
      <StablePanel
        {...gameplay}
        onClose={onClose}
        onNavigate={onNavigate}
      />
    );
  if (scene === 'market')
    return (
      <div className={styles.content}>
        <MarketPanel {...gameplay} />
      </div>
    );
  if (scene === 'barracks')
    return (
      <div className={styles.content}>
        <BarracksTraining {...gameplay} />
        <BuildingPanel
          {...gameplay}
          building="barracks"
          onClose={onClose}
          onNavigate={onNavigate}
        />
      </div>
    );
  if (scene === 'war-council') return <><CommanderPanel {...gameplay} /><RallyPanel {...gameplay} onClose={onClose} onCampaign={props.onCampaign} onShowMap={props.onShowMap} onNavigate={onNavigate} onOpenTraining={(target) => onSelectScene(target)} /></>;
  if (scene === 'siege-workshop')
    return (
      <SiegeWorkshopPanel
        key={`${props.view.worldId}:${props.village.id}`}
        worldId={props.view.worldId}
        villageId={props.village.id}
        busy={gameplay.busy}
        onChanged={props.onRefresh}
      />
    );
  const building: Building = scene === 'palace' ? 'hall' : scene;
  return (
    <BuildingPanel {...gameplay} building={building} onClose={onClose} onNavigate={onNavigate} />
  );
}

function BarracksTraining(props: GameProps) {
  const { view, village } = props;
  const speed = 1 + Math.max(0, village.buildings.barracks - 1) * view.config.barracksSpeedPerLevel;
  return (
    <section className={styles.panel} aria-label="تجنيد الثكنة">
      <h3>تجنيد الجيش</h3>
      <p>
        مستوى الثكنة {number(village.buildings.barracks)} · سرعة التدريب ×
        <bdi>{speed.toLocaleString('ar-SA')}</bdi>
      </p>
      {village.training ? (
        <p role="status">
          يتدرب الآن {number(village.training.count)}{' '}
          {view.config.units[village.training.unit].name} · يكتمل{' '}
          <time dateTime={new Date(village.training.endsAt).toISOString()}>
            {date(village.training.endsAt)}
          </time>
        </p>
      ) : (
        <p className={styles.muted}>طابور التدريب متاح.</p>
      )}
      {unitKeys.filter((unit) => trainingBuilding(unit) === 'barracks').map((unit) => (
        <TrainingUnit key={unit} {...props} unit={unit} />
      ))}
    </section>
  );
}

function TrainingUnit({
  view,
  village,
  busy,
  send,
  unit,
}: GameProps & { unit: Unit }) {
  const [count, setCount] = useState('1');
  const spec = view.config.units[unit];
  const amount = Number(count);
  const valid = Number.isSafeInteger(amount) && amount >= 1 && amount <= 10000;
  const locked =
    village.buildings.barracks < 1 ||
    (unit === 'settler' && village.buildings.hall < view.config.settlerHallLevel);
  const away =
    view.movements
      .filter((move) => move.sourceId === village.id)
      .reduce(
        (sum, move) => sum + unitKeys.reduce((total, key) => total + move.troops[key], 0),
        0,
      ) +
    view.villages.reduce(
      (sum, target) =>
        sum +
        unitKeys.reduce((total, key) => total + (target.reinforcements[village.id]?.[key] ?? 0), 0),
      0,
    );
  const full = unitKeys.reduce((sum, key) => sum + village.troops[key], away) + amount > 1e6;
  const shortage = resourceKeys.some((key) => village.resources[key] < spec.cost[key] * amount);
  const disabled = busy || Boolean(village.training) || locked || !valid || shortage || full;
  return (
    <article className={styles.unit}>
      <h4>
        {spec.name} · {number(village.troops[unit])} جاهز
      </h4>
      <p className={styles.muted}>
        هجوم {number(spec.attack)} · دفاع {number(spec.defense)} · حمولة {number(spec.carry)} · غذاء{' '}
        {number(spec.upkeep)}/ساعة
      </p>
      <p>
        <ResourceText resources={spec.cost} />
      </p>
      <p className={styles.muted}>
        {unit === 'settler'
          ? `يتطلب المستوطن دار حكم بالمستوى ${number(view.config.settlerHallLevel)} وثكنة.`
          : 'يتطلب ثكنة من المستوى ١.'}
      </p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) void send({ type: 'train', villageId: village.id, unit, count: amount });
        }}
      >
        <Input
          label={`عدد ${spec.name}`}
          type="number"
          min={1}
          max={10000}
          step={1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          required
          dir="ltr"
        />
        <p>
          مدة العدد المختار {number(Math.ceil(trainingDurationMs(spec.seconds, valid ? amount : 1, village.buildings.barracks, view.config.barracksSpeedPerLevel) / 1000))} ثانية
        </p>
        <Button type="submit" disabled={disabled}>
          درّب {spec.name}
        </Button>
        {locked && <p className={styles.muted}>متطلبات الوحدة غير مكتملة.</p>}
        {shortage && valid && <p className={styles.muted}>الموارد لا تكفي لهذا العدد.</p>}
        {full && <p className={styles.muted}>بلغ الجيش الحد الأعلى.</p>}
      </form>
    </article>
  );
}
