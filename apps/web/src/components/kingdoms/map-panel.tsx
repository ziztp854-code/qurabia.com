'use client';

import { useState } from 'react';
import { Castle, Flag } from 'lucide-react';
import { Input, Select, Button } from '@/components/ui';
import { unitKeys } from '@/lib/kingdoms/types';
import type { KingdomsCommand } from '@/lib/kingdoms/commands';
import { CommandForm, Empty, date, number, value, type GameProps } from './shared';
import styles from './kingdoms.module.css';
import { WorldMap } from './world-map';

const missionLabels = {
  attack: 'هجوم',
  raid: 'غارة',
  scout: 'استطلاع',
  reinforce: 'تعزيز',
  settle: 'تأسيس قرية',
  occupy: 'احتلال أرض',
  return: 'عودة',
};
type March = Extract<KingdomsCommand, { type: 'march' }>;

export function MapPanel({ view, village, busy, send }: GameProps) {
  const [center, setCenter] = useState({ x: village.x, y: village.y });
  const [target, setTarget] = useState({ x: village.x, y: village.y });
  const [query, setQuery] = useState('');
  const villages = view.map
    .filter((item) => `${item.name} ${item.kingdomName}`.includes(query.trim()))
    .sort(
      (a, b) =>
        Math.hypot(a.x - village.x, a.y - village.y) - Math.hypot(b.x - village.x, b.y - village.y),
    );
  const locate = (point: { x: number; y: number }) => {
    setCenter({ x: point.x, y: point.y });
    setTarget({ x: point.x, y: point.y });
  };
  const radius = view.config.worldRadius;
  const chosen = view.map.find((item) => item.x === target.x && item.y === target.y);
  const tileOwner = view.territories[`${target.x},${target.y}`];
  return (
    <div className={styles.split}>
      <section className={styles.panel}>
        <div className={styles.row}>
          <h2>أطلس الممالك</h2>
          <span className={styles.cost}>حدود العالم ±{number(radius)}</span>
        </div>
        <CommandForm
          key={`${center.x},${center.y}`}
          busy={false}
          label="انتقل إلى الإحداثيات"
          onSubmit={(data) => setCenter({ x: value(data, 'x'), y: value(data, 'y') })}
        >
          <div className={styles.coordinates}>
            <Input
              label="مركز الخريطة X"
              name="x"
              type="number"
              min={-radius}
              max={radius}
              defaultValue={center.x}
              dir="ltr"
              required
            />
            <Input
              label="مركز الخريطة Y"
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
        <p className={styles.cost}>
          اختر أرضًا لعرضها. القلعة تعني قرية، والراية تعني أرضًا محتلة.
        </p>
        <WorldMap
          center={center}
          target={target}
          origin={village}
          radius={radius}
          playerId={view.player?.id}
          villages={view.map}
          territories={view.territories}
          onCenter={setCenter}
          onSelect={setTarget}
        />
        <div className={styles.mapLegend} aria-label="مفتاح الخريطة">
          <span>
            <Castle size={16} aria-hidden="true" />
            قريتك
          </span>
          <span>
            <Castle size={16} aria-hidden="true" />
            قرية أخرى
          </span>
          <span>
            <Flag size={16} aria-hidden="true" />
            أرض محتلة
          </span>
          <span>· أرض خالية</span>
        </div>
        <div className={styles.row}>
          <Button variant="ghost" onClick={() => locate(village)}>
            قريتي
          </Button>
          <span>
            {chosen?.name ?? (tileOwner ? 'أرض محتلة' : 'أرض خالية')}{' '}
            <bdi dir="ltr">
              ({target.x}, {target.y})
            </bdi>
          </span>
        </div>
        <section aria-label="القرية المختارة" className={styles.selectedTile}>
          <h3>{chosen?.name ?? (tileOwner ? 'أرض محتلة' : 'أرض خالية')}</h3>
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
        <section className={styles.panel}>
          <h2>إرسال حملة</h2>
          <p className={styles.muted}>
            المسافة: {Math.hypot(target.x - village.x, target.y - village.y).toFixed(2)} خانة. وقت
            الوصول يتحدد حسب أبطأ وحدة. التوسع يتطلب مستوطنًا وموارد التأسيس.
          </p>
          <CommandForm
            busy={busy}
            label="أرسل الحملة"
            onSubmit={(data) =>
              void send({
                type: 'march',
                villageId: village.id,
                targetX: target.x,
                targetY: target.y,
                mission: String(data.get('mission')) as March['mission'],
                troops: {
                  guard: value(data, 'guard'),
                  rider: value(data, 'rider'),
                  scout: value(data, 'scout'),
                  settler: value(data, 'settler'),
                },
              })
            }
          >
            <Select name="mission" label="نوع الحملة">
              {Object.entries(missionLabels)
                .filter(([key]) => key !== 'return')
                .map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
            </Select>
            <div className={styles.coordinates}>
              {unitKeys.map((unit) => (
                <Input
                  label={`${view.config.units[unit].name} (${number(village.troops[unit])} متاح)`}
                  key={unit}
                  name={unit}
                  type="number"
                  min="0"
                  max={village.troops[unit]}
                  defaultValue="0"
                  required
                  dir="ltr"
                />
              ))}
            </div>
            <p className={styles.cost}>
              الوجهة:{' '}
              <bdi dir="ltr">
                {target.x}, {target.y}
              </bdi>
              . تأكد من نوع الحملة والوجهة قبل الإرسال.
            </p>
          </CommandForm>
        </section>
        <section className={styles.panel}>
          <h2>تحركات الجيوش</h2>
          {view.movements.length ? (
            view.movements.map((movement) => (
              <div className={styles.row} key={movement.id}>
                <span>
                  {missionLabels[movement.mission]}{' '}
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
                  </small>
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
  );
}
