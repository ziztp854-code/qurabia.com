'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@/components/ui';
import {
  equipmentKeys,
  type Equipment,
  type WorkshopAction,
  type projectWorkshop,
} from '@/lib/kingdoms/siege-workshop';
import { resourceKeys } from '@/lib/kingdoms/types';
import { date, number, ResourceText } from '../shared';
import styles from './siege-workshop-panel.module.css';

type WorkshopData = ReturnType<typeof projectWorkshop> & { paused: boolean; ended: boolean };
type Props = { worldId: string; villageId: string; busy: boolean; onChanged?: () => void };
class WorkshopRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
async function responseData(response: Response): Promise<WorkshopData> {
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new WorkshopRequestError(result.error ?? 'تعذّر تحميل الورشة.', response.status >= 500);
  return result.data as WorkshopData;
}

export function SiegeWorkshopPanel({ worldId, villageId, busy, onChanged }: Props) {
  const [data, setData] = useState<WorkshopData | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState<WorkshopAction | null>(null);
  const [reload, setReload] = useState(0);
  const active = useRef(false);
  const generation = useRef(0);
  const readSerial = useRef(0);
  const context = useRef(`${worldId}:${villageId}`);
  useEffect(() => {
    const owner = `${worldId}:${villageId}`;
    context.current = owner;
    let alive = true;
    const controller = new AbortController();
    async function load() {
      const requestGeneration = generation.current;
      const requestSerial = ++readSerial.current;
      try {
        const query = new URLSearchParams({ worldId, villageId });
        const next = await responseData(
          await fetch(`/api/kingdoms/siege-workshop?${query}`, {
            cache: 'no-store',
            signal: controller.signal,
          }),
        );
        if (
          alive &&
          !active.current &&
          requestGeneration === generation.current &&
          requestSerial === readSerial.current
        ) {
          setData(next);
          setError('');
        }
      } catch (cause) {
        if (alive && !controller.signal.aborted && !active.current && requestGeneration === generation.current && requestSerial === readSerial.current)
          setError(cause instanceof Error ? cause.message : 'تعذّر تحميل الورشة.');
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !active.current) void load();
    }, 10000);
    return () => {
      alive = false;
      context.current = '';
      controller.abort();
      window.clearInterval(interval);
    };
  }, [worldId, villageId, reload]);

  async function command(action: WorkshopAction) {
    if (active.current || busy) return;
    active.current = true;
    generation.current += 1;
    setSending(true);
    setError('');
    setRetry(null);
    const owner = `${worldId}:${villageId}`;
    try {
      const next = await responseData(
        await fetch('/api/kingdoms/siege-workshop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worldId, villageId, action }),
        }),
      );
      if (context.current === owner) {
        setData(next);
        onChanged?.();
      }
    } catch (cause) {
      if (context.current === owner) {
        setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ الطلب.');
        if (!(cause instanceof WorkshopRequestError) || cause.retryable) setRetry(action);
      }
    } finally {
      active.current = false;
      if (context.current === owner) setSending(false);
    }
  }
  const disabled = busy || sending || Boolean(data?.paused || data?.ended || retry);
  const affordable = (cost: WorkshopData['resources']) =>
    data && resourceKeys.every((key) => data.resources[key] >= cost[key]);
  return (
    <section className={styles.panel} aria-label="إدارة ورشة الحصار">
      <h3>ورشة الحصار</h3>
      {error && <p role="alert">{error}</p>}
      {retry && (
        <Button onClick={() => void command(retry)} disabled={sending || busy}>
          أعد الطلب نفسه
        </Button>
      )}
      {!data ? (
        <>
          <p role="status">تحميل الورشة المحفوظة…</p>
          {error && <Button onClick={() => setReload((value) => value + 1)}>أعد التحميل</Button>}
        </>
      ) : (
        <>
          <p>
            مستوى الورشة {number(data.level)} · سرعة التصنيع ×
            {(1 + Math.max(0, data.level - 1) * 0.2).toLocaleString('ar-SA')}
          </p>
          {data.paused && <p>العالم متوقف مؤقتًا؛ طابور المعدات محفوظ.</p>}
          {data.ended && <p>انتهى الموسم؛ أوامر التصنيع مغلقة.</p>}
          {data.nextLevel && (
            <div className={styles.section}>
              <h4>{data.level === 0 ? 'بناء الورشة' : 'تطوير الورشة'}</h4>
              <p>يتطلب دار حكم {number(data.nextLevel.hall)}</p>
              <ResourceText resources={data.nextLevel.cost} />
              <Button
                onClick={() => void command({ type: 'upgrade', key: crypto.randomUUID() })}
                disabled={
                  disabled ||
                  data.hallLevel < data.nextLevel.hall ||
                  !affordable(data.nextLevel.cost)
                }
              >
                {data.level === 0 ? 'ابنِ ورشة الحصار' : 'طوّر ورشة الحصار'}
              </Button>
            </div>
          )}
          {equipmentKeys.map((equipment) => (
            <EquipmentOrder
              key={equipment}
              equipment={equipment}
              data={data}
              disabled={disabled}
              command={command}
            />
          ))}
          <section className={styles.section} aria-label="طابور تصنيع المعدات">
            <h4>طابور المعدات · {number(data.queue.length)}/٣</h4>
            {data.queue.length ? (
              data.queue.map((item) => (
                <p key={item.id}>
                  {item.kind === 'repair' ? 'إصلاح' : 'تصنيع'} {number(item.count)}{' '}
                  {data.recipes[item.equipment].name} · يكتمل{' '}
                  <time dateTime={new Date(item.endsAt).toISOString()}>{date(item.endsAt)}</time>
                </p>
              ))
            ) : (
              <p>لا توجد عمليات تصنيع جارية.</p>
            )}
            <p className={styles.hint}>
              المعدات تنضم إلى المخزون بعد تأكيد الخادم؛ تحديث الطابور كل ١٠ ثوانٍ.
            </p>
          </section>
          <section className={styles.section}>
            <h4>إصلاح المعدات</h4>
            {equipmentKeys.some((equipment) => data.damaged[equipment] > 0) ? (
              equipmentKeys
                .filter((equipment) => data.damaged[equipment] > 0)
                .map((equipment) => (
                  <div key={equipment}>
                    <p>
                      {data.recipes[equipment].name} · متضرر {number(data.damaged[equipment])}
                    </p>
                    <ResourceText
                      resources={
                        Object.fromEntries(
                          resourceKeys.map((key) => [
                            key,
                            Math.ceil(data.recipes[equipment].cost[key] * 0.25),
                          ]),
                        ) as WorkshopData['resources']
                      }
                    />
                    <Button
                      disabled={
                        disabled ||
                        data.queue.length >= 3 ||
                        data.level < data.recipes[equipment].level ||
                        !affordable(
                          Object.fromEntries(
                            resourceKeys.map((key) => [
                              key,
                              Math.ceil(data.recipes[equipment].cost[key] * 0.25),
                            ]),
                          ) as WorkshopData['resources'],
                        )
                      }
                      onClick={() =>
                        void command({
                          type: 'repair',
                          key: crypto.randomUUID(),
                          equipment,
                          count: 1,
                        })
                      }
                    >
                      أصلح {data.recipes[equipment].name}
                    </Button>
                  </div>
                ))
            ) : (
              <p>لا توجد معدات متضررة في مخزونك.</p>
            )}
            <p className={styles.hint}>
              إرفاق المعدات بالجيش وأضرار المعدات في المعارك غير متاحين حاليًا.
            </p>
          </section>
        </>
      )}
    </section>
  );
}

function EquipmentOrder({
  equipment,
  data,
  disabled,
  command,
}: {
  equipment: Equipment;
  data: WorkshopData;
  disabled: boolean;
  command: (action: WorkshopAction) => Promise<void>;
}) {
  const [count, setCount] = useState('1');
  const amount = Number(count),
    spec = data.recipes[equipment];
  const valid = Number.isSafeInteger(amount) && amount >= 1 && amount <= 10;
  const cost = Object.fromEntries(
    resourceKeys.map((resource) => [resource, spec.cost[resource] * (valid ? amount : 1)]),
  ) as WorkshopData['resources'];
  const unavailable =
    disabled ||
    !valid ||
    data.level < spec.level ||
    data.queue.length >= 3 ||
    resourceKeys.some((key) => data.resources[key] < cost[key]);
  return (
    <article className={styles.section}>
      <h4>
        {spec.name} · مخزون {number(data.inventory[equipment])}
      </h4>
      <p>يتطلب ورشة بالمستوى {number(spec.level)}</p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!unavailable)
            void command({ type: 'craft', key: crypto.randomUUID(), equipment, count: amount });
        }}
      >
        <Input
          label={`عدد ${spec.name}`}
          type="number"
          dir="ltr"
          min={1}
          max={10}
          step={1}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          required
        />
        <ResourceText resources={cost} />
        <p>
          مدة التصنيع{' '}
          {number(
            Math.ceil(
              (spec.seconds * (valid ? amount : 1)) / (1 + Math.max(0, data.level - 1) * 0.2),
            ),
          )}{' '}
          ثانية
        </p>
        <Button type="submit" disabled={unavailable}>
          صنّع {spec.name}
        </Button>
      </form>
    </article>
  );
}
