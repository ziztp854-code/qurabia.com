'use client';
import { useMemo, useRef, useState } from 'react';
import { getGameplayContext } from '@/lib/alfazaa/realm/context';
import { getSystemsSnapshot } from '@/lib/alfazaa/realm/systems-read';
import { SystemsQuestView } from './systems-panel-quests';
import { SystemsResearchView, SystemsTroopsView } from './systems-panel-research';
import { SystemsBagView, SystemsCraftView, SystemsShopView } from './systems-panel-economy';
import { SystemsProgressView, SystemsEventView } from './systems-panel-progress';
import { quantity, type SystemsPanelProps } from './systems-panel-shared';
import styles from './systems-panel.module.css';
const tabs = [
  ['quests', 'المهام'],
  ['research', 'الأبحاث'],
  ['troops', 'التدريب والعلاج'],
  ['bag', 'الحقيبة'],
  ['craft', 'الصناعة'],
  ['shop', 'الإمداد والمتجر'],
  ['progress', 'المرافق والآثار'],
  ['events', 'التحديات'],
] as const;
export function SystemsPanel({
  state,
  send,
  busy,
  world,
  initialTab = 'quests',
}: SystemsPanelProps) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>(initialTab),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false),
    context = useMemo(() => getGameplayContext(state, state.updatedAt, world), [state, world]);
  const snapshot = useMemo(
    () => getSystemsSnapshot(state.realm.systems, state.balances, state.updatedAt),
    [state],
  );
  const run: SystemsPanelProps['send'] = async (command) => {
    if (running.current || busy) return;
    running.current = true;
    setWorking(true);
    setError('');
    try {
      return await send(command);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذّر حفظ الأمر. أعد المحاولة.');
    } finally {
      running.current = false;
      setWorking(false);
    }
  };
  const props = { state, send: run, busy: busy || working, context, query, page, setPage };
  return (
    <section className={styles.panel} data-alfazaa-systems dir="rtl" aria-label="ديوان المملكة">
      <header className={styles.heading}>
        <div>
          <span>الفزعة · ديوان المملكة</span>
          <h2>جهّز المملكة للمعركة التالية</h2>
          <p>استكمل الشروط، أدر مواردك، ثم استلم المكافآت المحفوظة لحسابك.</p>
        </div>
        <div className={styles.seal}>
          <b>{quantity(snapshot.playerLevel)}</b>
          <small>مستوى اللاعب</small>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="أنظمة المملكة">
        {tabs.map(([id, name]) => (
          <button
            type="button"
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setPage(0);
              setQuery('');
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <label className={styles.search}>
        البحث في {tabs.find(([id]) => id === tab)?.[1]}
        <input
          type="search"
          placeholder="اسم أو رقم العنصر"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </label>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {tab === 'quests' ? <SystemsQuestView {...props} /> : null}
      {tab === 'research' ? <SystemsResearchView {...props} /> : null}
      {tab === 'troops' ? <SystemsTroopsView {...props} /> : null}
      {tab === 'bag' ? <SystemsBagView {...props} /> : null}
      {tab === 'craft' ? <SystemsCraftView {...props} /> : null}
      {tab === 'shop' ? <SystemsShopView {...props} /> : null}
      {tab === 'progress' ? <SystemsProgressView {...props} /> : null}
      {tab === 'events' ? <SystemsEventView {...props} /> : null}
    </section>
  );
}
