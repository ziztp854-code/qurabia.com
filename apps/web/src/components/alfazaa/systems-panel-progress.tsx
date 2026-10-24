/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import { getProgressionView } from '@/lib/alfazaa/realm/systems-progression';
import { getEventViews } from '@/lib/alfazaa/realm/systems-events';
import {
  Action,
  Resources,
  Pages,
  canPay,
  matches,
  pageRows,
  quantity,
  type SystemsViewProps,
} from './systems-panel-shared';
import styles from './systems-panel.module.css';
export function SystemsProgressView({
  state,
  context,
  query,
  page,
  setPage,
  busy,
  send,
}: SystemsViewProps) {
  const [tab, setTab] = useState<'beasts' | 'destroyer' | 'relics'>('beasts');
  const progress = useMemo(
    () => getProgressionView(state.realm.systems, context),
    [state.realm.systems, context],
  );
  const beasts = progress.beasts.filter((r) => matches(query, r.name, r.id)),
    relics = progress.relics.filter((r) => matches(query, r.name, r.id));
  return (
    <div className={styles.section}>
      <nav className={styles.families} aria-label="أنظمة التطوير">
        <button
          type="button"
          aria-pressed={tab === 'beasts'}
          onClick={() => {
            setTab('beasts');
            setPage(0);
          }}
        >
          المرافقون
        </button>
        <button
          type="button"
          aria-pressed={tab === 'destroyer'}
          onClick={() => setTab('destroyer')}
        >
          عربة الحرب
        </button>
        <button
          type="button"
          aria-pressed={tab === 'relics'}
          onClick={() => {
            setTab('relics');
            setPage(0);
          }}
        >
          الآثار
        </button>
      </nav>
      <details className={styles.notice}>
        <summary>قواعد التطوير في الفزعة</summary>
        <p>{progress.rules}</p>
        <p>
          الآثار المجهزة تمنح زيادة للصحة؛ المرافقون وعربة الحرب يمنحون زيادة للهجوم وفق القواعد
          المستقلة المعروضة.
        </p>
      </details>
      {tab === 'beasts' ? (
        <>
          <p>يبدأ الاحتضان من مستوى قلعة 2. تتطلب كل زيادة مستوى عنصر إطعام؛ الحد الأعلى 100.</p>
          <div className={styles.grid}>
            {pageRows(beasts, page).map((row) => (
              <article className={styles.card} key={row.id}>
                {row.image ? (
                  <img src={row.image} alt="" width={220} height={140} loading="lazy" />
                ) : null}
                <h3>
                  {row.name} · {row.level ? `مستوى ${quantity(row.level)}` : 'غير مملوك'}
                </h3>
                {row.level ? (
                  <>
                    <Resources entries={row.feedCost} label="تكلفة الإطعام" />
                    <Action
                      busy={busy}
                      disabled={row.level >= 100 || !canPay(state.balances, row.feedCost)}
                      onClick={() => void send({ type: 'systems-beast-feed', beastId: row.id })}
                    >
                      إطعام المرافق
                    </Action>
                  </>
                ) : (
                  <>
                    <Resources entries={row.cost} label="تكلفة الاحتضان" />
                    <small>{quantity(row.seconds)} ثانية</small>
                    <Action
                      busy={busy}
                      disabled={
                        !row.eligible ||
                        !!state.realm.systems.jobs.find((j) => j.kind === 'hatch') ||
                        !canPay(state.balances, row.cost)
                      }
                      onClick={() => void send({ type: 'systems-beast-hatch', beastId: row.id })}
                    >
                      {row.job ? 'الاحتضان جارٍ' : 'بدء الاحتضان'}
                    </Action>
                  </>
                )}
              </article>
            ))}
          </div>
          <Pages total={beasts.length} page={page} setPage={setPage} />
        </>
      ) : null}
      {tab === 'destroyer' ? (
        <article className={styles.card}>
          <h3>عربة الحرب · مستوى {quantity(progress.destroyer.level)}</h3>
          <p>
            تفتح عند مستوى قلعة 5. يحوّل تنفيذ الفزعة خبرة التدريب المطلوبة إلى مخطوطات: مخطوطة لكل
            100 خبرة مع التقريب للأعلى.
          </p>
          <Resources
            entries={progress.destroyer.cost as [number, number][]}
            label="تكلفة تطوير العربة"
          />
          <Action
            busy={busy}
            disabled={
              !progress.destroyer.eligible ||
              !progress.destroyer.next ||
              !canPay(state.balances, progress.destroyer.cost as [number, number][])
            }
            onClick={() => void send({ type: 'systems-destroyer-upgrade' })}
          >
            {progress.destroyer.next ? 'تطوير عربة الحرب' : 'بلغت أعلى مستوى'}
          </Action>
        </article>
      ) : null}
      {tab === 'relics' ? (
        <>
          <p>
            أربع خانات بحسب نوع الأثر. تجهيز أثر آخر في الخانة نفسها يحتفظ بالسابق دون إتلافه.
            التفكيك متاح للأثر غير المجهز ويعيد مواد المصدر مرة واحدة.
          </p>
          <div className={styles.grid}>
            {pageRows(relics, page).map((row) => (
              <article className={styles.card} key={row.id}>
                <h3>
                  {row.name} · خانة {quantity(row.slot)}
                </h3>
                <small>
                  {row.owned
                    ? `مستوى ${quantity(row.level)} · ${row.equipped ? 'مجهز' : 'في المستودع'}`
                    : `غير مملوك · لديك ${quantity(state.balances[row.id] ?? 0)} في الحقيبة`}
                </small>
                <Action
                  busy={busy}
                  disabled={row.equipped || (!row.owned && (state.balances[row.id] ?? 0) < 1)}
                  onClick={() => void send({ type: 'systems-relic-equip', relicId: row.id })}
                >
                  {row.equipped ? 'مجهز' : 'تجهيز الأثر'}
                </Action>
                {row.owned ? (
                  <>
                    <Resources entries={row.next?.cost ?? []} label="تكلفة تطوير الأثر" />
                    <Action
                      busy={busy}
                      disabled={!row.next || !canPay(state.balances, row.next.cost)}
                      onClick={() => void send({ type: 'systems-relic-upgrade', relicId: row.id })}
                    >
                      تطوير الأثر
                    </Action>
                    <details>
                      <summary>تفكيك الأثر</summary>
                      <p>ستفقد هذا الأثر ومستوياته؛ لا تُسترد مواد التطوير.</p>
                      <Resources entries={row.decompose} label="عائد التفكيك" />
                      <Action
                        busy={busy}
                        disabled={row.equipped}
                        onClick={() =>
                          void send({ type: 'systems-relic-dismantle', relicId: row.id })
                        }
                      >
                        تفكيك الأثر غير المجهز
                      </Action>
                    </details>
                  </>
                ) : (
                  <p>ابحث عن الأثر لدى أمين الإمداد، ثم جهّزه هنا.</p>
                )}
              </article>
            ))}
          </div>
          <Pages total={relics.length} page={page} setPage={setPage} />
        </>
      ) : null}
    </div>
  );
}
export function SystemsEventView({ state, busy, send }: SystemsViewProps) {
  const events = getEventViews(state.realm.systems);
  return (
    <div className={styles.section}>
      <p className={styles.notice}>
        تحديات مستقلة تعمل من تقدّمك الفعلي في الفزعة. اليوم ينتهي عند منتصف الليل في الرياض،
        والأسبوع يبدأ يوم الاثنين. كل جائزة تُصرف مرة واحدة في دورتها.
      </p>
      {events.map((event) => (
        <section className={styles.section} key={event.id}>
          <h3>{event.name}</h3>
          <p>{event.description}</p>
          <small>
            التقدم {quantity(event.progress)} · التجديد{' '}
            {new Date(event.resetsAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}
          </small>
          <div className={styles.grid}>
            {event.tiers.map((tier) => (
              <article className={styles.card} key={tier.tier}>
                <h3>هدف {quantity(tier.threshold)}</h3>
                <progress
                  aria-label={`تقدم ${event.name} لهدف ${tier.threshold}`}
                  max={tier.threshold}
                  value={Math.min(event.progress, tier.threshold)}
                />
                <Resources entries={tier.reward} label="جائزة التحدي" />
                <Action
                  busy={busy}
                  disabled={!tier.eligible}
                  onClick={() =>
                    void send({ type: 'systems-event-claim', eventId: event.id, tier: tier.tier })
                  }
                >
                  {tier.claimed ? 'استُلمت الجائزة' : 'استلام جائزة التحدي'}
                </Action>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
