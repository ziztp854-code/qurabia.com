import { useMemo, useState } from 'react';
import type { QuestFamily } from '@/lib/alfazaa/realm/systems-types';
import { getQuestViews, getDailyView } from '@/lib/alfazaa/realm/systems-quests';
import {
  Action,
  Resources,
  Pages,
  matches,
  pageRows,
  quantity,
  type SystemsViewProps,
} from './systems-panel-shared';
import styles from './systems-panel.module.css';
const families: [QuestFamily, string][] = [
  ['main', 'الرئيسية'],
  ['road', 'درب المجد'],
  ['plot', 'الفصول'],
  ['daily', 'اليومية'],
  ['milestone', 'الإنجازات'],
];
const statusNames = {
  locked: 'أكمل المتطلبات السابقة',
  active: 'قيد التقدم',
  ready: 'المكافأة جاهزة',
  claimed: 'استُلمت',
  unavailable: 'غير متاحة حاليًا',
};
export function SystemsQuestView({
  state,
  context,
  query,
  page,
  setPage,
  send,
  busy,
}: SystemsViewProps) {
  const [family, setFamily] = useState<QuestFamily>('main'),
    [showLocked, setShowLocked] = useState(false);
  const quests = useMemo(
    () => getQuestViews(state.realm.systems, context, family),
    [state.realm.systems, context, family],
  );
  const daily = useMemo(
    () => getDailyView(state.realm.systems, context),
    [state.realm.systems, context],
  );
  const shown = quests
    .filter(
      (q) =>
        matches(query, q.name, q.id, q.sourceDescription) && (showLocked || q.status !== 'locked'),
    )
    .sort(
      (a, b) =>
        (a.status === 'ready' ? -1 : 0) - (b.status === 'ready' ? -1 : 0) ||
        a.chapter - b.chapter ||
        a.id - b.id,
    );
  return (
    <div className={styles.section}>
      <nav className={styles.families} aria-label="عائلات المهام">
        {families.map(([id, name]) => (
          <button
            type="button"
            key={id}
            aria-pressed={family === id}
            onClick={() => {
              setFamily(id);
              setPage(0);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={showLocked}
          onChange={(e) => {
            setShowLocked(e.target.checked);
            setPage(0);
          }}
        />
        إظهار المهام المقفلة
      </label>
      {family === 'daily' ? (
        <>
          <p className={styles.notice}>
            {context.view.playerLevel < 10
              ? 'تفتح المهام اليومية عند مستوى اللاعب 10. طوّر المملكة ودرب القوات لاكتساب خبرة اللاعب.'
              : `اختيرت ${quantity(daily.choices.length)} مهام لهذا اليوم. أنجزت ${quantity(daily.completed)}. تتجدد عند منتصف الليل بتوقيت الرياض.`}
          </p>
          <div className={styles.grid}>
            {daily.boxes.map((box) => (
              <article className={styles.card} key={box.index}>
                <h3>صندوق {quantity(box.threshold)} مهام</h3>
                <Resources entries={box.reward} label="مكافأة الصندوق" />
                <Action
                  busy={busy}
                  disabled={!box.eligible}
                  onClick={() => void send({ type: 'systems-daily-box', index: box.index })}
                >
                  {box.claimed ? 'استُلم الصندوق' : 'استلام الصندوق'}
                </Action>
              </article>
            ))}
          </div>
        </>
      ) : null}
      <div className={styles.grid}>
        {pageRows(shown, page).map((quest) => (
          <article className={styles.card} key={`${family}:${quest.id}`}>
            <span className={`${styles.status} ${quest.status === 'ready' ? styles.ready : ''}`}>
              {quest.chapter ? `الفصل ${quantity(quest.chapter)} · ` : ''}
              {statusNames[quest.status]}
            </span>
            <h3>{quest.name}</h3>
            <progress aria-label={`تقدم ${quest.name}`} value={quest.progress} max={quest.goal} />
            <small>
              {quantity(quest.progress)} / {quantity(quest.goal)}
            </small>
            {quest.adaptation ? (
              <details>
                <summary>تفاصيل المهمة المستقلة</summary>
                <p>{quest.adaptation}</p>
                <p>وصف المصدر: {quest.sourceDescription || 'مكافأة فصل'}</p>
              </details>
            ) : null}
            <footer>
              <Resources entries={quest.reward} label="مكافأة المهمة" />
              <Action
                busy={busy}
                disabled={quest.status !== 'ready'}
                label={`استلام مكافأة ${quest.name}`}
                onClick={() => void send({ type: 'systems-claim', family, id: quest.id })}
              >
                {quest.status === 'claimed' ? 'استُلمت المكافأة' : 'استلام المكافأة'}
              </Action>
            </footer>
          </article>
        ))}
      </div>
      {!shown.length ? (
        <p className={styles.empty}>
          لا توجد مهام ظاهرة. جرّب عائلة أخرى أو أظهر المهام المقفلة لمعرفة المتطلبات.
        </p>
      ) : null}
      <Pages total={shown.length} page={page} setPage={setPage} />
    </div>
  );
}
