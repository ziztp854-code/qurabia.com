'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldAccountView } from '@/lib/alfazaa/server/world-repository';
import type { WorldCommand } from '@/lib/alfazaa/realm/world-engine';
import { buildingKeys, unitKeys, resourceKeys } from '@/lib/kingdoms/types';
import { WorldSocial } from './world-panel-social';
import styles from './world-panel.module.css';

export function WorldPanel({ demo }: { demo: boolean }) {
  const [data, setData] = useState<WorldAccountView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [name, setName] = useState('مخفر الفزعة');
  const [gold, setGold] = useState(100);
  const [confirmed, setConfirmed] = useState(false);
  const [cell, setCell] = useState(-1);
  const [building, setBuilding] = useState<(typeof buildingKeys)[number]>('lumber');
  const [unit, setUnit] = useState<(typeof unitKeys)[number]>('guard');
  const [count, setCount] = useState(1);
  const [target, setTarget] = useState('');
  const [mission, setMission] = useState<
    'attack' | 'raid' | 'scout' | 'reinforce' | 'gather' | 'occupy'
  >('attack');
  const [troops, setTroops] = useState<Record<string, number>>({});
  const pending = useRef<{
    idempotencyKey: string;
    expectedRevision: number;
    command: WorldCommand;
  } | null>(null);
  const running = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (running.current) return;
    try {
      const response = await fetch('/api/alfazaa/world', { cache: 'no-store', signal });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'تعذّر تحميل العالم');
      if (!signal?.aborted) setData(result.data);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : 'تعذّر الاتصال');
    }
  }, []);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void refresh(controller.signal);
    });
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(controller.signal);
    }, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [demo, refresh]);
  const send = async (command?: WorldCommand) => {
    if (!data || running.current) return;
    if (pending.current && command) {
      setError('أعد محاولة الطلب المعلّق أولًا');
      return;
    }
    pending.current ??= {
      idempotencyKey: crypto.randomUUID(),
      expectedRevision: data.revision,
      command: command!,
    };
    setHasPending(true);
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/alfazaa/world', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(pending.current),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status >= 400 && response.status < 500) {
          pending.current = null;
          setHasPending(false);
        }
        throw new Error(result.error || 'تعذّر تنفيذ الأمر');
      }
      setData(result.data);
      pending.current = null;
      setHasPending(false);
      setConfirmed(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'انقطع الاتصال؛ أعد المحاولة بالمفتاح نفسه',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  if (demo)
    return (
      <section className={styles.panel} dir="rtl">
        <h2>العالم المشترك</h2>
        <p>
          سجّل الدخول لإنشاء مخفر ومقابلة لاعبين حقيقيين والتجارة والانضمام للتحالفات. تقدم المدينة
          التجريبية مستقل.
        </p>
        <a href="/login">تسجيل الدخول</a>
      </section>
    );
  const world = data?.world;
  const village = world?.villages[0];
  const chosen = data?.city.troops.find((t) => t.cell === cell);
  const action = (value: unknown) => void send({ type: 'outpost', action: value } as WorldCommand);
  return (
    <section className={styles.panel} dir="rtl" aria-label="عالم الفزعة المشترك" aria-busy={busy}>
      <header className={styles.heading}>
        <div>
          <span>حدود المملكة</span>
          <h2>عالم الفزعة</h2>
          <p>مخفر مستقل بموارد وجيش خاصين، في عالم مستمر مع حسابات حقيقية.</p>
        </div>
        <button disabled={busy} onClick={() => void refresh()}>
          تحديث العالم
        </button>
      </header>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {hasPending && (
        <button disabled={busy} onClick={() => void send()}>
          إعادة محاولة الطلب المعلّق
        </button>
      )}
      {!data && <p role="status">جارٍ تحميل العالم…</p>}
      {data && !world?.player && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({ type: 'join', name });
          }}
        >
          <label>
            اسم المخفر
            <input
              required
              minLength={2}
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p>
            تبدأ بموارد بناء دون ذهب أو جنود. حمايتك الأولى دقيقتان؛ لا يمكن تكرار إنشاء المخفر.
          </p>
          <button disabled={busy}>إنشاء المخفر</button>
        </form>
      )}
      {data && world && village && (
        <>
          <div className={styles.resources}>
            {resourceKeys.map((key) => (
              <div key={key}>
                <span>{resourceNames[key]}</span>
                <strong>{Math.floor(village.resources[key]).toLocaleString('ar-SA')}</strong>
              </div>
            ))}
          </div>
          <p>
            مخفر {village.name} · ({village.x}، {village.y}) ·{' '}
            {world.player && world.player.protectionUntil > world.serverNow
              ? 'الحماية مفعّلة'
              : 'قابل للاستهداف'}{' '}
            · انتصاراتك {world.progress.victories}
          </p>
          <p>
            إسناد أبطال المدينة: زيادة قوة الحراس حتى 30٪ حسب مستوى القلعة وأقوى بطل. ينضم قائد
            الإسناد المتاح تلقائيًا للمسيرة، ويغيب عن دفاع المخفر أثناءها.
          </p>
          <div className={styles.columns}>
            <section className={styles.section}>
              <h3>المدينة ↔ المخفر</h3>
              <p>
                ذهب المدينة: {Math.floor(data.city.gold).toLocaleString('ar-SA')}. ينقل الإيداع
                الذهب من المدينة ويعيده السحب إليها.
              </p>
              <label>
                كمية الذهب
                <input
                  type="number"
                  min={1}
                  max={1e9}
                  value={gold}
                  onChange={(e) => setGold(Number(e.target.value))}
                />
              </label>
              <div className={styles.actions}>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send({
                      type: 'deposit-gold',
                      amount: gold,
                      expectedCityRevision: data.city.revision,
                    })
                  }
                >
                  إيداع في المخفر
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send({
                      type: 'withdraw-gold',
                      amount: gold,
                      expectedCityRevision: data.city.revision,
                    })
                  }
                >
                  سحب إلى المدينة
                </button>
              </div>
              <label>
                جندي المدينة
                <select
                  value={cell}
                  onChange={(e) => {
                    setCell(Number(e.target.value));
                    setConfirmed(false);
                  }}
                >
                  <option value={-1}>اختر الجندي</option>
                  {data.city.troops
                    .filter((t) => t.conversion)
                    .map((t) => (
                      <option key={t.cell} value={t.cell}>
                        الخانة {t.cell + 1} ← {t.conversion!.count}{' '}
                        {world.config.units[t.conversion!.unit].name}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                أوافق على حذف جندي المدينة نهائيًا مقابل جنود المخفر. لا يعود إلى المدينة بعد
                القتال.
              </label>
              <button
                disabled={busy || !confirmed || !chosen?.conversion}
                onClick={() =>
                  void send({
                    type: 'convert-troop',
                    cell,
                    confirm: true,
                    expectedCityRevision: data.city.revision,
                  })
                }
              >
                تحويل دائم إلى المخفر
              </button>
            </section>
            <section className={styles.section}>
              <h3>البناء والتجنيد</h3>
              <label>
                المبنى
                <select
                  value={building}
                  onChange={(e) => setBuilding(e.target.value as typeof building)}
                >
                  {buildingKeys.map((b) => (
                    <option key={b} value={b}>
                      {world.config.buildings[b].name} · مستوى {village.buildings[b]}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {Object.entries(world.config.buildings[building].cost)
                  .map(([r, n]) => `${resourceNames[r]} ${n}`)
                  .join(' · ')}{' '}
                (تكلفة المستوى الأول؛ تزداد مع المستوى)
              </p>
              <button
                disabled={busy}
                onClick={() => action({ type: 'build', villageId: village.id, building })}
              >
                بدء البناء
              </button>
              <label>
                الفئة
                <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
                  {unitKeys.map((u) => (
                    <option key={u} value={u}>
                      {world.config.units[u].name} · متاح {village.troops[u]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                العدد
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </label>
              <button
                disabled={busy}
                onClick={() => action({ type: 'train', villageId: village.id, unit, count })}
              >
                تجنيد
              </button>
              <p>
                طابور البناء: {village.constructionQueue?.length ?? 0} · التدريب:{' '}
                {village.training
                  ? `${village.training.count} · ${new Date(village.training.endsAt).toLocaleTimeString('ar-SA')}`
                  : 'لا يوجد'}
              </p>
            </section>
          </div>
          <section className={styles.section}>
            <h3>المسيرات والقتال</h3>
            <p>
              مهاجمة لاعب تنهي حمايتك. الدفاع والتحالف والحماية يطبّقها الخادم؛ الجنود المفقودون لا
              يعودون.
            </p>
            <label>
              الهدف
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">اختر مخفرًا أو موردًا</option>
                {world.map.map((v) => (
                  <option key={v.id} value={`v:${v.id}`}>
                    {v.name} ({v.x}،{v.y}){v.ownerId === world.player?.id ? ' — أنت' : ''}
                  </option>
                ))}
                {world.resourceSites?.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name} ({s.x}،{s.y})
                  </option>
                ))}
              </select>
            </label>
            <label>
              المهمة
              <select
                value={mission}
                onChange={(e) => setMission(e.target.value as typeof mission)}
              >
                <option value="attack">هجوم</option>
                <option value="raid">غارة</option>
                <option value="scout">استطلاع</option>
                <option value="reinforce">تعزيز</option>
                <option value="gather">جمع موارد</option>
              </select>
            </label>
            <div className={styles.troops}>
              {unitKeys.map((u) => (
                <label key={u}>
                  {world.config.units[u].name} ({village.troops[u]})
                  <input
                    type="number"
                    min={0}
                    max={village.troops[u]}
                    value={troops[u] || 0}
                    onChange={(e) => setTroops({ ...troops, [u]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <button
              disabled={busy || !target}
              onClick={() => {
                const point = target.startsWith('v:')
                  ? world.map.find((v) => v.id === target.slice(2))
                  : world.resourceSites?.find((s) => s.id === target.slice(2));
                if (point)
                  action({
                    type: 'march',
                    villageId: village.id,
                    targetX: point.x,
                    targetY: point.y,
                    mission,
                    troops: Object.fromEntries(unitKeys.map((u) => [u, troops[u] || 0])),
                  });
              }}
            >
              إرسال المسيرة
            </button>
            <ul>
              {world.movements.map((m) => (
                <li key={m.id}>
                  {m.mission === 'return' ? 'عودة الجيش' : m.mission} · وصول{' '}
                  {new Date(m.arrivesAt).toLocaleTimeString('ar-SA')}
                </li>
              ))}
              {world.incoming.map((m) => (
                <li key={m.id}>
                  مسيرة واردة: {m.mission} · {new Date(m.arrivesAt).toLocaleTimeString('ar-SA')}
                </li>
              ))}
            </ul>
          </section>
          <WorldSocial
            world={world}
            village={village}
            busy={busy}
            action={action}
            command={(value) => void send(value)}
          />
          <section className={styles.section}>
            <h3>التقارير الخاصة بك</h3>
            {!world.reports.length && <p>ستظهر نتائج القتال والتجارة والمسيرات هنا.</p>}
            <ol>
              {[...world.reports]
                .reverse()
                .slice(0, 30)
                .map((r) => (
                  <li key={r.id}>
                    <strong>{r.title}</strong>
                    <p>{r.detail}</p>
                  </li>
                ))}
            </ol>
          </section>
        </>
      )}
    </section>
  );
}
export const resourceNames: Record<string, string> = {
  wood: 'خشب',
  stone: 'حجر',
  iron: 'حديد',
  food: 'غذاء',
  gold: 'ذهب',
};
