'use client';

import { useState } from 'react';
import { Castle } from 'lucide-react';
import { Input, Select, Button } from '@/components/ui';
import { unitKeys, type Troops } from '@/lib/kingdoms/types';
import { emptyTroops } from '@/lib/kingdoms/simulation';
import { marchTravelDurationMs } from '@/lib/kingdoms/commander-movement';
import type { KingdomsCommand } from '@/lib/kingdoms/commands';
import { CommandForm, Empty, date, number, value, type GameProps } from './shared';
import styles from './kingdoms.module.css';
import { MamlukWorldMap } from '../mamluk-map/mamluk-world-map';
import type { MapMode } from '../mamluk-map/map-mode';
import { GatheringPanel, ResourceSiteDirectory } from './resource-site-panel';
import mapStyles from './world-map.module.css';
import { canSelectCommander, CommanderSelect } from './commander-select';
import { commanderText } from './commander-ui';

const missionLabels = {
  attack: 'هجوم',
  raid: 'غارة',
  scout: 'استطلاع',
  reinforce: 'تعزيز',
  settle: 'تأسيس قرية',
  occupy: 'ضم أرض',
  gather: 'جمع موارد',
  return: 'عودة',
  intercept: 'اعتراض',
};
type March = Extract<KingdomsCommand, { type: 'march' }>;
export type MapSelection = {
  center: { x: number; y: number };
  target: { x: number; y: number };
};

export function MapPanel({
  view,
  village,
  busy,
  send,
  initialSelection,
  initialMission,
}: GameProps & { initialSelection?: MapSelection | null; initialMission?: March['mission'] }) {
  const [center, setCenter] = useState(initialSelection?.center ?? { x: village.x, y: village.y });
  const [target, setTarget] = useState(initialSelection?.target ?? { x: village.x, y: village.y });
  const [query, setQuery] = useState('');
  const [gatherFocus, setGatherFocus] = useState(false);
  const [commanderId, setCommanderId] = useState('');
  const [troops, setTroops] = useState<Troops>(emptyTroops);
  const [mission, setMission] = useState<March['mission']>(initialMission ?? 'attack');
  const mode: MapMode = mission === 'scout' ? 'SELECT_SCOUT_TARGET'
    : mission === 'reinforce' ? 'SELECT_REINFORCEMENT_TARGET'
    : mission === 'settle' || mission === 'occupy' ? 'SELECT_SETTLEMENT_TARGET'
    : 'SELECT_ATTACK_TARGET';
  const commanderAvailable =
    !commanderId ||
    (view.commanders ?? []).some(
      (commander) =>
        commander.id === commanderId && canSelectCommander(commander, village.id, view.serverNow),
    );
  const resourceSites = view.resourceSites ?? [];
  const villages = view.map
    .filter((item) => `${item.name} ${item.kingdomName}`.includes(query.trim()))
    .sort(
      (a, b) =>
        Math.hypot(a.x - village.x, a.y - village.y) - Math.hypot(b.x - village.x, b.y - village.y),
    );
  const locate = (point: { x: number; y: number }) => {
    setCenter({ x: point.x, y: point.y });
    setTarget({ x: point.x, y: point.y });
    setGatherFocus(resourceSites.some((site) => site.x === point.x && site.y === point.y));
  };
  const hasGeographicAnchor = (x: number, y: number) =>
    view.map.some((item) => item.x === x && item.y === y) ||
    (view.abandonedVillages ?? []).some((item) => item.x === x && item.y === y);
  const radius = view.config.worldRadius;
  const chosen = view.map.find((item) => item.x === target.x && item.y === target.y);
  const tileOwner = view.territories[`${target.x},${target.y}`];
  const chosenSite =
    !chosen && !tileOwner
      ? resourceSites.find((site) => site.x === target.x && site.y === target.y)
      : undefined;
  const commander = commanderAvailable
    ? view.commanders?.find((item) => item.id === commanderId)
    : undefined;
  const travelMs = commanderAvailable
    ? marchTravelDurationMs(view.config, village, target, troops, commander)
    : null;
  const travelSeconds = Math.ceil((travelMs ?? 0) / 1000);
  const slowestUnit = unitKeys.filter((unit) => troops[unit] > 0).toSorted(
    (a, b) => view.config.units[a].speed - view.config.units[b].speed,
  )[0];
  return (
    <div className={mapStyles.commandDeck}>
      <section className={mapStyles.mapSurface}>
        <div className={mapStyles.mapHeader}>
          <div>
            <h2>إرسال حملة</h2>
            <p>حدّد وجهتك، واستكشف مواقع الموارد القريبة من قريتك.</p>
          </div>
          <span className={styles.cost}>حدود العالم ±{number(radius)}</span>
        </div>
        <details className={mapStyles.coordinateSearch}>
          <summary>اختر وجهة بإحداثيات اللعبة</summary>
          <p className={styles.muted}>اختر الأراضي الخالية ومواقع الموارد بإحداثيات اللعبة. معاينة هذه الخانات على الخريطة الجغرافية غير متوفرة.</p>
          <CommandForm
            key={`${center.x},${center.y}`}
            busy={false}
            label="اختر الإحداثيات"
            onSubmit={(data) => locate({ x: value(data, 'x'), y: value(data, 'y') })}
          >
            <div className={styles.coordinates}>
              <Input
                label="الوجهة X"
                name="x"
                type="number"
                min={-radius}
                max={radius}
                defaultValue={center.x}
                dir="ltr"
                required
              />
              <Input
                label="الوجهة Y"
                name="y"
                type="number"
                min={-radius}
                max={radius}
                defaultValue={center.y}
                dir="ltr"
                required
              />
            </div>
          </CommandForm>
        </details>
        <MamlukWorldMap
          worlds={[{ id: view.worldId, name: view.worldName }]}
          initialWorldId={view.worldId}
          viewerPlayerId={view.player!.id}
          initialVillageId={village.id}
          focusVillageId={chosen?.id}
          mode={mode}
          targetVillageIds={view.map.map((item) => item.id)}
          onConfirmTarget={(targetVillageId) => {
            const destination = view.map.find((item) => item.id === targetVillageId);
            if (destination) locate(destination);
          }}
        />
        <div className={mapStyles.targetReadout}>
          <Button variant="ghost" onClick={() => locate(village)}>
            قريتي
          </Button>
          <section
            aria-label={chosenSite ? 'موقع الموارد المختار' : 'القرية المختارة'}
            className={styles.selectedTile}
          >
            <h3>{chosen?.name ?? chosenSite?.name ?? (tileOwner ? 'أرض محتلة' : 'أرض خالية')}</h3>
            <p className={styles.cost}>
              الوجهة المختارة{' '}
              <bdi dir="ltr">
                {target.x}, {target.y}
              </bdi>{' '}
              · المسافة {Math.hypot(target.x - village.x, target.y - village.y).toFixed(2)} خانة
            </p>
            {chosen && (
              <p className={styles.muted}>
                {chosen.kingdomName}
                {chosen.protectedUntil > view.serverNow &&
                  ` · حماية حتى ${date(chosen.protectedUntil)}`}
              </p>
            )}
          </section>
        </div>
      </section>
      <div className={mapStyles.operations}>
        <section className={styles.panel}>
          <ResourceSiteDirectory
            sites={resourceSites}
            origin={village}
            target={target}
            onLocate={locate}
          />
          <section className={styles.villageDirectory} aria-label="قرى العالم">
            <h3>قرى العالم · {number(view.map.length)}</h3>
            <Input
              label="ابحث عن قرية أو مملكة"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
            />
            <div className={styles.villageList}>
              {villages.slice(0, 50).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={styles.villageListItem}
                  aria-label={`اعرض ${item.name} على الخريطة`}
                  aria-pressed={chosen?.id === item.id}
                  onClick={() => locate(item)}
                >
                  <Castle size={20} aria-hidden="true" />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.kingdomName}
                      {item.ownerId === view.player?.id ? ' · قريتك' : ''}
                    </small>

                  </span>
                  <bdi dir="ltr">
                    {item.x}, {item.y}
                  </bdi>
                </button>
              ))}
            </div>
            {!villages.length && <Empty>لا قرى تطابق البحث.</Empty>}
            {villages.length > 50 && (
              <p className={styles.cost}>أقرب ٥٠ قرية. استخدم البحث للوصول إلى قرية محددة.</p>
            )}
          </section>
        </section>
        <div className={styles.stack}>
          {chosenSite ? (
            <GatheringPanel
              key={`${village.id}:${chosenSite.id}`}
              view={view}
              village={village}
              busy={busy}
              send={send}
              site={chosenSite}
              focusOnMount={gatherFocus}
            />
          ) : (
            <section className={styles.panel} data-campaign-mission={mission}>
              <h2>إرسال حملة</h2>
              <p className={styles.muted}>
                المسافة: {Math.hypot(target.x - village.x, target.y - village.y).toFixed(2)} خانة.
                وقت الوصول يتحدد حسب أبطأ وحدة. التوسع يتطلب مستوطنًا وموارد التأسيس.
                {commanderId && commanderAvailable && (
                  <> {commanderText('commander.arrivalHint')}</>
                )}
              </p>
              <CommandForm
                busy={busy}
                submitDisabled={!commanderAvailable}
                label="أرسل الحملة"
                onSubmit={(data) =>
                  commanderAvailable &&
                  void send({
                    type: 'march',
                    villageId: village.id,
                    targetX: target.x,
                    targetY: target.y,
                    mission: String(data.get('mission')) as March['mission'],
                    ...(commanderId ? { commanderId } : {}),
                    troops: {
                      guard: value(data, 'guard'),
                      rider: value(data, 'rider'),
                      scout: value(data, 'scout'),
                      settler: value(data, 'settler'),
                      archer: value(data, 'archer'),
                      mounted_archer: value(data, 'mounted_archer'),
                      sultan_guard: value(data, 'sultan_guard'),
                      siege_engineer: value(data, 'siege_engineer'),
                      siege_tower: value(data, 'siege_tower'),
                    },
                  })
                }
              >
                <Select name="mission" label="نوع الحملة" value={mission}
                  onChange={(event) => setMission(event.target.value as March['mission'])}>
                  {Object.entries(missionLabels)
                    .filter(([key]) => key !== 'return' && key !== 'gather')
                    .map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                </Select>
                <CommanderSelect
                  view={view}
                  villageId={village.id}
                  value={commanderId}
                  onChange={setCommanderId}
                  disabled={busy}
                />
                <div className={styles.coordinates}>
                  {unitKeys.map((unit) => (
                    <Input
                      label={`${view.config.units[unit].name} (${number(village.troops[unit])} متاح)`}
                      key={unit}
                      name={unit}
                      type="number"
                      min="0"
                      max={village.troops[unit]}
                      value={troops[unit]}
                      onChange={(event) => setTroops((current) => ({
                        ...current,
                        [unit]: Number(event.target.value) || 0,
                      }))}
                      required
                      dir="ltr"
                    />
                  ))}
                </div>
                <section aria-label="معاينة رحلة الجيش" className={styles.selectedTile}>
                  {travelMs === null ? (
                    <p>اختر القوات لعرض مدة الرحلة.</p>
                  ) : (
                    <>
                      <p>
                        مدة الرحلة: <output aria-label="مدة الرحلة المتوقعة" data-duration-ms={travelMs}>
                          {number(Math.floor(travelSeconds / 3600))} س{' '}
                          {number(Math.floor(travelSeconds / 60) % 60)} د{' '}
                          {number(travelSeconds % 60)} ث
                        </output>
                      </p>
                      <p>أبطأ وحدة: {view.config.units[slowestUnit!].name}. تُحسب المسافة بخانات اللعبة؛ قرب القرى في الرسم الجغرافي لا يغيّرها.</p>
                      <p className={styles.muted}>هذه معاينة للذهاب فقط. يبدأ الجيش بعد قبول الخادم، ويثبت موعد الوصول عند الإرسال.</p>
                    </>
                  )}
                </section>
                <p className={styles.cost}>
                  الوجهة:{' '}
                  <bdi dir="ltr">
                    {target.x}, {target.y}
                  </bdi>
                  . تأكد من نوع الحملة والوجهة قبل الإرسال.
                </p>
              </CommandForm>
            </section>
          )}
          <section className={styles.panel}>
            <h2>تحركات الجيوش</h2>
            {view.movements.length ? (
              view.movements.map((movement) => (
                <div className={styles.row} key={movement.id}>
                  <span>
                    {missionLabels[movement.mission]}{' '}
                    {movement.gather &&
                      `· ${movement.gather.resource === 'wood' ? 'خشب' : movement.gather.resource === 'iron' ? 'حديد' : 'قمح'} `}
                    <bdi dir="ltr">
                      ({movement.targetX}, {movement.targetY})
                    </bdi>
                    <br />
                    <small>
                      {unitKeys
                        .filter((key) => movement.troops[key] > 0)
                        .map(
                          (key) => `${number(movement.troops[key])} ${view.config.units[key].name}`,
                        )
                        .join(' · ')}
                      {movement.commanderId && (
                        <>
                          {' · '}
                          {commanderText('commander.select')}:{' '}
                          <bdi>
                            {view.commanders?.find(
                              (commander) => commander.id === movement.commanderId,
                            )?.name ?? '—'}
                          </bdi>
                        </>
                      )}
                    </small>
                    {(!hasGeographicAnchor(movement.targetX, movement.targetY) ||
                      (movement.originX !== undefined && movement.originY !== undefined &&
                        !hasGeographicAnchor(movement.originX, movement.originY)) ||
                      (movement.mission === 'return' &&
                        (movement.originX === undefined || movement.originY === undefined))) && (
                      <>
                        <br />
                        <small className={styles.muted}>
                          رحلة بإحداثيات اللعبة؛ لا يتوفر مسار جغرافي موثوق. تابع الوجهة وموعد الوصول هنا.
                        </small>
                      </>
                    )}
                  </span>
                  <time dateTime={new Date(movement.arrivesAt).toISOString()}>
                    {date(movement.arrivesAt)}
                  </time>
                </div>
              ))
            ) : (
              <Empty>لا جيوش في الطريق.</Empty>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
