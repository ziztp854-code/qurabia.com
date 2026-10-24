import { useMemo, useState } from 'react';
import { getResearchOffers } from '@/lib/alfazaa/realm/systems-research';
import { getTrainingOffers, getHealingOffers } from '@/lib/alfazaa/realm/systems-queues';
import { systemsCatalog, armRow, researchRow } from '@/lib/alfazaa/realm/systems-catalog';
import {
  Action,
  Resources,
  Pages,
  Count,
  canPay,
  matches,
  pageRows,
  quantity,
  resourceName,
  sourceText,
  type SystemsViewProps,
} from './systems-panel-shared';
import styles from './systems-panel.module.css';
const jobs = { research: 'بحث', training: 'تدريب', healing: 'علاج', hatch: 'احتضان' };
function Queues({ state, context, busy, send }: SystemsViewProps) {
  const [speed, setSpeed] = useState(100001);
  const speedups = systemsCatalog.items.filter(
    (i) => i.speedSeconds > 0 && (state.balances[i.id] ?? 0) > 0,
  );
  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <h3>الطوابير المحفوظة</h3>
        <Action busy={busy} onClick={() => void send({ type: 'systems-tick' })}>
          تحديث الطوابير
        </Action>
      </div>
      {speedups.length ? (
        <label className={styles.field}>
          عنصر التسريع
          <select
            value={speedups.some((i) => i.id === speed) ? speed : speedups[0].id}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {speedups.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {quantity(state.balances[i.id] ?? 0)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className={styles.grid}>
        {state.realm.systems.jobs.map((job) => (
          <article className={styles.card} key={job.id}>
            <h3>
              {jobs[job.kind]} ·{' '}
              {job.kind === 'research'
                ? researchRow(job.tree ?? 'college', job.target)?.name
                : job.kind === 'hatch'
                  ? systemsCatalog.beasts.find((r) => r.id === job.target)?.name
                  : armRow(job.target)?.name}
            </h3>
            <p>
              {quantity(job.count)} ·{' '}
              {quantity(Math.max(0, Math.ceil((job.finishAt - context.now) / 1000)))} ثانية متبقية
            </p>
            <small>
              الإكمال: {new Date(job.finishAt).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}
            </small>
            {speedups.length ? (
              <Action
                busy={busy}
                onClick={() =>
                  void send({
                    type: 'systems-speedup',
                    jobId: job.id,
                    itemId: speedups.some((i) => i.id === speed) ? speed : speedups[0].id,
                    count: 1,
                  })
                }
              >
                استعمال عنصر تسريع واحد
              </Action>
            ) : (
              <p>لا توجد عناصر تسريع في الحقيبة.</p>
            )}
          </article>
        ))}
      </div>
      {!state.realm.systems.jobs.length ? (
        <p className={styles.empty}>الطوابير خالية. ابدأ بحثًا أو تدريبًا، وسيُحفظ موعد الإكمال.</p>
      ) : null}
    </div>
  );
}
export function SystemsResearchView(props: SystemsViewProps) {
  const { state, context, query, page, setPage, busy, send } = props;
  const [tree, setTree] = useState<'college' | 'science'>('college');
  const rows = useMemo(
    () => getResearchOffers(state.realm.systems, context),
    [state.realm.systems, context],
  ).filter((r) => r.tree === tree && matches(query, r.name, r.description, r.id));
  return (
    <div className={styles.section}>
      <nav className={styles.families} aria-label="كليات البحث">
        <button
          type="button"
          aria-pressed={tree === 'college'}
          onClick={() => {
            setTree('college');
            setPage(0);
          }}
        >
          الكلية العسكرية
        </button>
        <button
          type="button"
          aria-pressed={tree === 'science'}
          onClick={() => {
            setTree('science');
            setPage(0);
          }}
        >
          كلية العلوم
        </button>
      </nav>
      <p className={styles.notice}>
        أكمل مستويات البحث بالتسلسل. لكل كلية طابور مستقل؛ تُصرف خبرة اللاعب عند اكتمال البحث.
      </p>
      <div className={styles.grid}>
        {pageRows(rows, page).map((row) => (
          <article className={styles.card} key={`${row.tree}:${row.id}`}>
            <h3>
              {row.name} · مستوى {quantity(row.level)}
            </h3>
            <p>
              {sourceText(row.description)
                .replace(
                  /\{0\}/g,
                  new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(
                    row.description.includes('%') ? row.value / 100 : row.value,
                  ),
                )
                .replace(/\{\d+\}/g, '')}
            </p>
            <small>
              القلعة {quantity(row.castle)} · اللاعب {quantity(row.playerLevel)} ·{' '}
              {quantity(row.seconds)} ثانية
            </small>
            <small>
              {row.requires.length
                ? 'تتطلب الأبحاث السابقة: ' +
                  row.requires
                    .map((raw) => {
                      const id = Array.isArray(raw) ? raw[0] : raw;
                      return (
                        systemsCatalog.research.find((r) => r.tree === tree && r.id === id)?.name ??
                        String(id)
                      );
                    })
                    .join('، ')
                : 'لا توجد أبحاث سابقة إضافية'}
            </small>
            <Resources entries={row.cost} label="تكلفة البحث" />
            <Action
              busy={busy}
              disabled={!row.eligible || row.busy || !canPay(state.balances, row.cost)}
              onClick={() => void send({ type: 'systems-research', tree: row.tree, id: row.id })}
            >
              {row.busy
                ? 'طابور الكلية مشغول'
                : row.eligible
                  ? 'بدء البحث'
                  : 'متطلبات البحث غير مكتملة'}
            </Action>
          </article>
        ))}
      </div>
      <Pages total={rows.length} page={page} setPage={setPage} />
      <Queues {...props} />
    </div>
  );
}
export function SystemsTroopsView(props: SystemsViewProps) {
  const { state, context, query, page, setPage, busy, send } = props,
    [count, setCount] = useState(1),
    [all, setAll] = useState(false);
  const offers = useMemo(
    () => getTrainingOffers(state.realm.systems, context),
    [state.realm.systems, context],
  );
  const healing = getHealingOffers(state.realm.systems, context, count);
  const rows = offers.filter((r) => (all || r.eligible) && matches(query, r.name, r.id));
  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <Count value={count} setValue={setCount} />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
              setPage(0);
            }}
          />
          إظهار القوات المقفلة
        </label>
      </div>
      <p className={styles.notice}>
        يتطلب التدريب ثكنة من نوع الوحدة وبمستواها أو أعلى. يصل الناتج إلى الاحتياط؛ انشره في خانة
        فارغة. المصابون يُعالجون في المستشفى.
      </p>
      <div className={styles.grid}>
        {pageRows(rows, page).map((row) => (
          <article className={styles.card} key={row.id}>
            <h3>
              {row.name} · مستوى {quantity(row.level)}
            </h3>
            <p>
              زمن المصدر للوحدة: {quantity(row.seconds)} ثانية. خبرة اللاعب: {quantity(row.xp)}.
            </p>
            <Resources entries={row.cost.map(([id, n]) => [id, n * count])} label="تكلفة التدريب" />
            <Action
              busy={busy}
              disabled={
                !row.eligible ||
                !canPay(state.balances, row.cost, count) ||
                state.realm.systems.jobs.filter((j) => j.kind === 'training').length >= 3
              }
              onClick={() => void send({ type: 'systems-train', cfgId: row.id, count })}
            >
              {row.eligible ? 'ابدأ التدريب' : 'تحتاج ثكنة وأبحاثًا أعلى'}
            </Action>
          </article>
        ))}
      </div>
      {!rows.length ? (
        <p className={styles.empty}>
          ابنِ ثكنة من المدينة لفتح التدريب، أو أظهر القوات المقفلة لمعرفة المستويات.
        </p>
      ) : null}
      <Pages total={rows.length} page={page} setPage={setPage} />
      <div className={styles.split}>
        <section className={styles.section}>
          <h3>الاحتياط</h3>
          {Object.entries(state.realm.systems.reserve)
            .filter(([, n]) => n > 0)
            .map(([id, n]) => (
              <article className={styles.card} key={id}>
                <h3>
                  {resourceName(+id)} · {quantity(n)}
                </h3>
                <Action
                  busy={busy}
                  disabled={!state.cells.some((c) => c === null)}
                  onClick={() => void send({ type: 'systems-deploy', cfgId: +id })}
                >
                  نشر وحدة في المدينة
                </Action>
              </article>
            ))}
          {!Object.values(state.realm.systems.reserve).some((n) => n > 0) ? (
            <p>لا توجد وحدات احتياطية.</p>
          ) : null}
        </section>
        <section className={styles.section}>
          <h3>المصابون</h3>
          {healing.map((row) => (
            <article className={styles.card} key={row.id}>
              <h3>
                {resourceName(row.id)} · {quantity(state.realm.systems.wounded[row.id])}
              </h3>
              <Resources entries={row.cost} label="تكلفة العلاج" />
              {!row.eligible ? <p>تحتاج مستشفى بسعة كافية وطابور علاج فارغ.</p> : null}
              <Action
                busy={busy}
                disabled={!row.eligible || !canPay(state.balances, row.cost)}
                onClick={() => void send({ type: 'systems-heal', cfgId: row.id, count: row.count })}
              >
                علاج {quantity(row.count)} وحدة
              </Action>
            </article>
          ))}
          {!healing.length ? <p>لا يوجد مصابون.</p> : null}
        </section>
      </div>
      <Queues {...props} />
    </div>
  );
}
