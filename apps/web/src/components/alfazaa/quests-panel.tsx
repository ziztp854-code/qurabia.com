'use client';
/* eslint-disable @next/next/no-img-element */
import { Flag, Check, RefreshCw } from 'lucide-react';
import { listQuests, catalog, type AlfazaaState, type Command } from '@/lib/alfazaa/domain';
import styles from './quests.module.css';
export function QuestsPanel({
  state,
  busy,
  send,
  reload,
}: {
  state: AlfazaaState;
  busy: boolean;
  send: (command: Command) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const quests = listQuests(state, state.updatedAt);
  return (
    <section className={styles.panel} aria-label="مهام الفزعة">
      <header>
        <Flag size={30} />
        <div>
          <h2>مهام الفزعة</h2>
          <p>حقق الشروط، ثم استلم مكافأتك. كل مهمة إنجاز تُصرف مرة واحدة.</p>
        </div>
        <button disabled={busy} onClick={() => void reload()}>
          <RefreshCw size={16} />
          تحديث المهام
        </button>
      </header>
      <p className={styles.notice}>
        مهمة الحضور تتجدد عند منتصف الليل بتوقيت الرياض. مكافآت هذه النسخة مقتبسة من بيانات المصدر؛
        لا تتصل بفعاليات اللعبة الأصلية أو حسابها.
      </p>
      <div className={styles.cards}>
        {quests.map((quest) => (
          <article key={quest.id} className={styles.quest}>
            <div className={styles.title}>
              <h3>{quest.title}</h3>
              <span>
                {quest.claimed ? 'تم الاستلام' : quest.ready ? 'جاهزة' : 'الشروط غير مكتملة'}
              </span>
            </div>
            <p>{quest.description}</p>
            <div className={styles.rewards} aria-label="المكافآت">
              {quest.rewards.map(([id, amount]) => {
                const item = catalog.items.find((i) => i.id === id);
                return (
                  <div key={id}>
                    {item?.image && <img src={item.image} alt="" />}
                    <span>
                      {amount.toLocaleString('ar-SA')} {item?.name || `مورد ${id}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              disabled={busy || !quest.ready}
              onClick={() => void send({ type: 'claim-quest', questId: quest.id })}
              aria-label={`استلام مكافأة ${quest.title}`}
            >
              {quest.claimed ? (
                <>
                  <Check size={16} />
                  تم الاستلام
                </>
              ) : (
                'استلام المكافأة'
              )}
            </button>
          </article>
        ))}
      </div>
      <p className={styles.notice}>
        المخططات تُستخدم للتطوير. بعض العناصر الأخرى محفوظة في الحقيبة للاستعراض؛ استعمال المستهلكات
        خارج نطاق هذه النسخة.
      </p>
    </section>
  );
}
