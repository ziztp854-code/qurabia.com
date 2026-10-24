/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import { getInventoryView } from '@/lib/alfazaa/realm/systems-inventory';
import { getShopOffers, getExchangeOffers } from '@/lib/alfazaa/realm/systems-shop';
import { systemsCatalog } from '@/lib/alfazaa/realm/systems-catalog';
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
export function SystemsBagView({ state, query, page, setPage, busy, send }: SystemsViewProps) {
  const [count, setCount] = useState(1),
    [choices, setChoices] = useState<Record<string, number>>({});
  const rows = useMemo(() => getInventoryView(state.balances), [state.balances]).filter((r) =>
    matches(query, r.name, r.description, r.id),
  );
  return (
    <div className={styles.section}>
      <Count value={count} setValue={setCount} />
      <p className={styles.notice}>
        استعمل الصناديق لاستخراج محتوياتها. كتب خبرة الأبطال تُستعمل من صفحة الأبطال، وعناصر التسريع
        من الطوابير.
      </p>
      <div className={styles.grid}>
        {pageRows(rows, page).map((item) => (
          <article className={styles.card} key={item.id}>
            {item.image ? (
              <img src={item.image} alt="" width={76} height={76} loading="lazy" />
            ) : null}
            <h3>
              {item.name} · {quantity(item.count)}
            </h3>
            <p>{sourceText(item.description)}</p>
            {item.selectable ? (
              <label className={styles.field}>
                اختر محتوى الصندوق
                <select
                  value={choices[item.id] ?? 0}
                  onChange={(e) => setChoices((old) => ({ ...old, [item.id]: +e.target.value }))}
                >
                  {item.choices.map((choice, index) => (
                    <option key={`${choice.id}:${index}`} value={index}>
                      {choice.name} × {quantity(choice.count)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {item.usable &&
            !item.speedSeconds &&
            ![110021, 110022, 110023, 110024, 110025].includes(item.id) ? (
              <Action
                busy={busy}
                disabled={count > item.count}
                onClick={() =>
                  void send({
                    type: 'systems-use',
                    itemId: item.id,
                    count,
                    ...(item.selectable ? { choice: choices[item.id] ?? 0 } : {}),
                  })
                }
              >
                استعمال {quantity(count)}
              </Action>
            ) : (
              <small>
                {item.speedSeconds
                  ? 'استخدمه من طابور البحث أو التدريب.'
                  : 'مادة تطوير؛ استعملها في النظام المناسب.'}
              </small>
            )}
          </article>
        ))}
      </div>
      {!rows.length ? <p className={styles.empty}>الحقيبة خالية من نتائج البحث.</p> : null}
      <Pages total={rows.length} page={page} setPage={setPage} />
    </div>
  );
}
export function SystemsCraftView({ state, query, page, setPage, busy, send }: SystemsViewProps) {
  const [count, setCount] = useState(1),
    [available, setAvailable] = useState(true);
  const rows = systemsCatalog.recipes.filter(
    (r) =>
      r.cost.length &&
      r.reward.length &&
      (!available || canPay(state.balances, r.cost, count)) &&
      matches(query, r.id, ...r.reward.map(([id]) => resourceName(id))),
  );
  return (
    <div className={styles.section}>
      <div className={styles.row}>
        <Count value={count} setValue={setCount} />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => {
              setAvailable(e.target.checked);
              setPage(0);
            }}
          />
          الوصفات التي أملك موادها
        </label>
      </div>
      <p className={styles.notice}>
        تُستهلك مواد الوصفة وتصل العناصر الناتجة للحقيبة في عملية واحدة. اشترِ المواد الناقصة من
        أمين الإمداد.
      </p>
      <div className={styles.grid}>
        {pageRows(rows, page).map((row) => (
          <article className={styles.card} key={row.id}>
            <h3>{row.reward.map(([id]) => resourceName(id)).join(' + ')}</h3>
            <small>المواد المطلوبة</small>
            <Resources entries={row.cost.map(([id, n]) => [id, n * count])} label="مواد الصناعة" />
            <small>الناتج</small>
            <Resources
              entries={row.reward.map(([id, n]) => [id, n * count])}
              label="ناتج الصناعة"
            />
            <Action
              busy={busy}
              disabled={!canPay(state.balances, row.cost, count)}
              onClick={() => void send({ type: 'systems-craft', recipeId: row.id, count })}
            >
              صناعة {quantity(count)}
            </Action>
          </article>
        ))}
      </div>
      {!rows.length ? (
        <p className={styles.empty}>
          لا توجد وصفات بهذه المواد. ألغِ خيار «الوصفات التي أملك موادها» لرؤية المطلوب.
        </p>
      ) : null}
      <Pages total={rows.length} page={page} setPage={setPage} />
    </div>
  );
}
export function SystemsShopView({
  state,
  context,
  query,
  page,
  setPage,
  busy,
  send,
}: SystemsViewProps) {
  const [mode, setMode] = useState<'exchange' | 'source'>('exchange'),
    [count, setCount] = useState(1);
  const exchanges = useMemo(() => getExchangeOffers(state.balances), [state.balances]).filter((r) =>
    matches(query, r.itemId, r.name),
  );
  const offers = useMemo(
    () => getShopOffers(state.realm.systems, context),
    [state.realm.systems, context],
  ).filter((r) => matches(query, r.id, ...r.reward.map(([id]) => resourceName(id))));
  return (
    <div className={styles.section}>
      <nav className={styles.families} aria-label="نوع المتجر">
        <button
          type="button"
          aria-pressed={mode === 'exchange'}
          onClick={() => {
            setMode('exchange');
            setPage(0);
          }}
        >
          أمين الإمداد
        </button>
        <button
          type="button"
          aria-pressed={mode === 'source'}
          onClick={() => {
            setMode('source');
            setPage(0);
          }}
        >
          عروض الموارد الأصلية
        </button>
      </nav>
      <Count value={count} setValue={setCount} />
      <p className={styles.notice}>
        جميع المشتريات بعملات اللعبة الافتراضية. عروض أمين الإمداد مستقلة لتوفير شظايا الأبطال
        والكتب ومواد التطوير؛ حد كل عنصر 100 دفعة يوميًا بتوقيت الرياض.
      </p>
      <div className={styles.grid}>
        {mode === 'exchange'
          ? pageRows(exchanges, page).map((row) => {
              const remaining = Math.max(
                0,
                row.dailyLimit - (state.realm.systems.shopDaily[`exchange:${row.itemId}`] ?? 0),
              );
              return (
                <article className={styles.card} key={row.itemId}>
                  {row.image ? (
                    <img src={row.image} width={76} height={76} alt="" loading="lazy" />
                  ) : null}
                  <h3>{row.name}</h3>
                  <small>المتبقي اليوم: {quantity(remaining)} دفعة</small>
                  <Resources entries={[[400001, row.gold * count]]} label="ثمن الإمداد" />
                  <Resources entries={[[row.itemId, row.count * count]]} label="عائد الإمداد" />
                  <Action
                    busy={busy}
                    disabled={
                      count > remaining || !canPay(state.balances, [[400001, row.gold]], count)
                    }
                    onClick={() =>
                      void send({ type: 'systems-exchange', itemId: row.itemId, count })
                    }
                  >
                    شراء الإمداد
                  </Action>
                </article>
              );
            })
          : pageRows(offers, page).map((row) => (
              <article className={styles.card} key={row.id}>
                <h3>{row.reward.map(([id]) => resourceName(id)).join(' + ')}</h3>
                <small>
                  مستوى اللاعب {quantity(row.minLevel)}–{quantity(row.maxLevel)} · المتبقي{' '}
                  {quantity(row.remaining)} · {row.limitType === 2 ? 'حد دائم' : 'يتجدد يوميًا'}
                </small>
                {row.allianceLevel ? (
                  <small>تحالف مستوى {quantity(row.allianceLevel)}</small>
                ) : null}
                <Resources entries={row.cost.map(([id, n]) => [id, n * count])} label="ثمن العرض" />
                <Resources
                  entries={row.reward.map(([id, n]) => [id, n * count])}
                  label="محتويات العرض"
                />
                <Action
                  busy={busy}
                  disabled={
                    !row.eligible ||
                    count > row.remaining ||
                    !canPay(state.balances, row.cost, count)
                  }
                  onClick={() => void send({ type: 'systems-buy', offerId: row.id, count })}
                >
                  شراء العرض
                </Action>
              </article>
            ))}
      </div>
      <Pages
        total={mode === 'exchange' ? exchanges.length : offers.length}
        page={page}
        setPage={setPage}
      />
    </div>
  );
}
