'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { getHeroCatalog } from '@/lib/alfazaa/realm/hero-catalog';
import { catalog } from '@/lib/alfazaa/domain/catalog';
import type { HeroBattleMode } from '@/lib/alfazaa/realm/hero-types';
import { itemName, type HeroPanelProps } from './hero-panel';
import styles from './hero-panel.module.css';
const source = getHeroCatalog();
const verbs: Record<string, string> = {
  attack: 'هجوم',
  strike: 'ضربة مهارة',
  heal: 'علاج',
  shield: 'درع',
  poison: 'ضرر مستمر',
  stun: 'إيقاف',
  weaken: 'إضعاف',
  buff: 'تقوية',
  defeat: 'سقوط الوحدة',
};
export function HeroPanelBattle({ state, send, busy }: HeroPanelProps) {
  const [mode, setMode] = useState<HeroBattleMode>('campaign'),
    [chosen, setChosen] = useState<number | null>(null);
  const descriptor = source.modes.find((x) => x.id === mode)!;
  const completed = state.realm.heroes.completed[mode];
  const next = descriptor.stages.find((x) => !completed.includes(x.id));
  const stage = descriptor.stages.find((x) => x.id === chosen) ?? next ?? descriptor.stages[0];
  const locked = !completed.includes(stage.id) && stage.id !== next?.id;
  const army = state.cells.filter((x) => x?.kind === 'troop');
  const battle = state.realm.heroes.lastBattle;
  const staminaCost = mode === 'campaign' ? 3 : 5;
  return (
    <div className={styles.battle}>
      <div className={styles.briefing}>
        <div>
          <p className={styles.eyebrow}>اختر وجهة الجيش</p>
          <h3>كل انتصار يفتح الطريق التالي</h3>
          <p>
            جهّز قائدًا أو قائدين وجيشًا من المدينة. المصابون بعد الهزيمة يحتاجون العلاج في قسم
            الأنظمة.
          </p>
        </div>
        <div className={styles.controls}>
          <label>
            نوع التحدي
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as HeroBattleMode);
                setChosen(null);
              }}
            >
              {source.modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.stages.length} مرحلة
                </option>
              ))}
            </select>
          </label>
          <label>
            المرحلة
            <select value={stage.id} onChange={(e) => setChosen(Number(e.target.value))}>
              {descriptor.stages.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                  disabled={!completed.includes(s.id) && s.id !== next?.id}
                >
                  {completed.includes(s.id) ? '✓ ' : s.id === next?.id ? '◈ ' : '🔒 '}المرحلة{' '}
                  {s.stage ?? s.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.preview}>
          <span>
            جيشك: {Math.min(9, army.length)} مواضع · {state.realm.heroes.party.length} قادة
          </span>
          <span>طاقة القتال: {staminaCost}</span>
          <span>
            {completed.length}/{descriptor.stages.length} مكتملة
          </span>
        </div>
        <p>
          {completed.includes(stage.id)
            ? 'هذه المرحلة مكتملة. يمكنك إعادة القتال دون تكرار المكافأة.'
            : `مكافأة الفوز الأول: ${stage.reward.map(([id, n]) => `${itemName(id)} ×${n.toLocaleString('ar-SA')}`).join('، ') || 'تقدم المرحلة'}`}
        </p>
        {stage.minCastle || stage.minPlayer ? (
          <p>
            المتطلبات: قلعة {stage.minCastle ?? 0} · مستوى لاعب {stage.minPlayer ?? 0}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button
            className={styles.fightButton}
            disabled={
              busy ||
              locked ||
              !army.length ||
              state.realm.heroes.stamina < staminaCost ||
              state.castleLevel < (stage.minCastle ?? 0)
            }
            onClick={() => void send({ type: 'hero-battle', mode, stageId: stage.id })}
          >
            ابدأ القتال
          </button>
          <button
            className={styles.secondary}
            disabled={
              busy ||
              state.realm.heroes.stamina >= 100 ||
              state.realm.heroes.restPurchases >= 3 ||
              (state.balances['400001'] ?? 0) < 500
            }
            onClick={() => void send({ type: 'hero-rest' })}
          >
            استراحة الجيش · 500 ذهب
          </button>
        </div>
        <p className={styles.cost}>
          الاستراحة تعيد 10 طاقة، حتى 3 مرات يوميًا. تتجدد نقطة كل خمس دقائق.
        </p>
        {!army.length ? (
          <p role="status">جيشك فارغ. جنّد وحدات في المدينة أو عالج المصابين ثم عد للقتال.</p>
        ) : null}
        <p className={styles.notice}>
          {mode === 'campaign' || mode === 'expedition'
            ? 'قواعد القتال مستقلة مع جيوش ومكافآت المصدر.'
            : 'هذا تحدي ضد جيش تدريب، ولا يغير ملكية العالم أو ترتيب اللاعبين.'}
        </p>
      </div>
      {battle ? (
        <article className={styles.result} aria-label="نتيجة قتال الأبطال">
          <header>
            <div>
              <p className={styles.eyebrow}>
                المرحلة {battle.stageId} · {battle.turns} جولات
              </p>
              <h3>{battle.won ? 'انتصر الجيش' : 'انسحاب الجيش'}</h3>
            </div>
            <strong>
              {battle.firstClear ? 'انتصار أول' : battle.won ? 'إعادة مرحلة' : 'عالج المصابين'}
            </strong>
          </header>
          {battle.reward.length ? (
            <p>
              المكافآت:{' '}
              {battle.reward
                .map(([id, n]) => `${itemName(id)} ×${n.toLocaleString('ar-SA')}`)
                .join('، ')}
            </p>
          ) : null}
          <div className={styles.armies}>
            {(['player', 'enemy'] as const).map((side) => (
              <div key={side}>
                <h4>{side === 'player' ? 'جيشك' : 'الجيش المقابل'}</h4>
                {battle.units
                  .filter((u) => u.side === side)
                  .map((u) => {
                    const art = catalog.arms.find((a) => a.id === u.cfgId);
                    return (
                      <div key={u.id} className={styles.unit}>
                        {art ? <img src={art.image} alt="" loading="lazy" /> : null}
                        <div>
                          <span>
                            {art?.name ?? `وحدة ${u.cfgId}`}
                            {u.hp === 0 ? ' · مصابة' : ''}
                          </span>
                          <progress aria-label={`حياة ${u.id}`} value={u.hp} max={u.maxHp} />
                          <small>
                            {u.hp.toLocaleString('ar-SA')} / {u.maxHp.toLocaleString('ar-SA')}
                          </small>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
          {battle.injuries.length ? (
            <p>أُضيفت {battle.injuries.length} وحدات إلى المصابين. عالجها ثم أعد نشرها.</p>
          ) : null}
          <details>
            <summary>سجل المعركة ({battle.events.length} أحداث)</summary>
            <ol className={styles.log}>
              {battle.events.map((e, i) => (
                <li key={i}>
                  <span>جولة {e.turn}</span>
                  <span>
                    {e.actor.startsWith('player') ? 'جيشك' : 'الخصم'} · {verbs[e.kind]}
                  </span>
                  <strong>{e.amount.toLocaleString('ar-SA')}</strong>
                </li>
              ))}
            </ol>
            {battle.logTruncated ? (
              <p>عُرض أول 120 حدثًا؛ النتيجة النهائية تشمل القتال كاملًا.</p>
            ) : null}
          </details>
        </article>
      ) : (
        <div className={styles.empty}>
          <h3>أول معركة تبدأ هنا</h3>
          <p>ابدأ بالحملة، ثم طور الأبطال وادمج الوحدات لرفع قوة الجيش.</p>
        </div>
      )}
    </div>
  );
}
