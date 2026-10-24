'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import type { AlfazaaState, Command } from '@/lib/alfazaa/domain/types';
import { catalog } from '@/lib/alfazaa/domain/catalog';
import { getHeroCatalog } from '@/lib/alfazaa/realm/hero-catalog';
import { getHeroStats } from '@/lib/alfazaa/realm/hero-stats';
import type { HeroDefinition } from '@/lib/alfazaa/realm/hero-types';
import { HeroPanelBattle } from './hero-panel-battle';
import { HeroPanelFormation } from './hero-panel-formation';
import styles from './hero-panel.module.css';
export interface HeroPanelProps {
  state: AlfazaaState;
  send: (command: Command) => Promise<unknown>;
  busy: boolean;
}
const source = getHeroCatalog();
export const itemName = (id: number) =>
  catalog.items.find((x) => x.id === id)?.name ?? `مادة ${id}`;
export const canPay = (balances: Record<string, number>, cost: number[][]) => {
  const totals: Record<string, number> = {};
  cost.forEach(([id, n]) => (totals[id] = (totals[id] ?? 0) + n));
  return Object.entries(totals).every(([id, n]) => (balances[id] ?? 0) >= n);
};
export function HeroPanel({ state, send, busy }: HeroPanelProps) {
  const [tab, setTab] = useState<'owned' | 'recruit' | 'formation' | 'battle'>('owned');
  const [selected, setSelected] = useState(62003),
    [query, setQuery] = useState('');
  const hero = source.heroes.find((x) => x.id === selected) ?? source.heroes[0];
  const owned = state.realm.heroes.roster;
  const heroes = source.heroes.filter(
    (h) =>
      (tab === 'recruit' ? !owned[h.id] : !!owned[h.id]) &&
      `${h.name} ${h.id}`.includes(query.trim()),
  );
  return (
    <section data-alfazaa-hero className={styles.panel} aria-label="قيادة الأبطال" dir="rtl">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>الفزعة · مجلس القادة</p>
          <h2>أبطالك، قوة جيشك</h2>
          <p>
            {Object.keys(owned).length} بطل مملوك من {source.heroes.length} · قائدان وتسعة مواضع
            للجيش
          </p>
        </div>
        <div className={styles.energy}>
          <strong>
            {state.realm.heroes.stamina}
            <small>/100</small>
          </strong>
          <span>طاقة الجيش</span>
        </div>
      </header>
      <nav className={styles.tabs} aria-label="أقسام قيادة الأبطال">
        {(['owned', 'recruit', 'formation', 'battle'] as const).map((id, i) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {['أبطالي', 'تجنيد أبطال', 'تشكيل الجيش', 'ساحة القتال'][i]}
          </button>
        ))}
      </nav>
      {tab === 'battle' ? (
        <HeroPanelBattle state={state} send={send} busy={busy} />
      ) : tab === 'formation' ? (
        <HeroPanelFormation state={state} send={send} busy={busy} />
      ) : (
        <div className={styles.layout}>
          <aside className={styles.roster}>
            <label>
              ابحث عن بطل
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="اسم البطل"
              />
            </label>
            <div className={styles.cards}>
              {heroes.map((h) => (
                <button
                  className={styles.card}
                  aria-pressed={h.id === hero.id}
                  key={h.id}
                  onClick={() => setSelected(h.id)}
                >
                  <img src={h.portrait} alt="" loading="lazy" />
                  <span>{h.name}</span>
                  <small>
                    {owned[h.id]
                      ? `المستوى ${owned[h.id].level}`
                      : `${state.balances[h.fragment] ?? 0}/${h.mergeCost} شظية`}
                  </small>
                </button>
              ))}
            </div>
            {!heroes.length && <p>لا توجد نتائج. اجمع شظايا الأبطال من المراحل والمهام.</p>}
          </aside>
          <HeroDetails key={hero.id} hero={hero} state={state} send={send} busy={busy} />
        </div>
      )}
      <details className={styles.rules}>
        <summary>عن قواعد هذه النسخة</summary>
        <p>
          صور الأبطال وبيانات التطوير مستخرجة من اللعبة. القتال والمناورات تنفيذ مستقل، وخصوم
          التحديات جيوش تدريب. مكافأة المرحلة الأولى تُصرف مرة واحدة. لا تتصل هذه النسخة بحساب
          اللعبة الأصلية.
        </p>
      </details>
    </section>
  );
}
function HeroDetails({ hero, state, send, busy }: HeroPanelProps & { hero: HeroDefinition }) {
  const [book, setBook] = useState(110021),
    [count, setCount] = useState(1),
    [gearId, setGearId] = useState(source.gear[0].id);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const owned = state.realm.heroes.roster[hero.id],
    stats = getHeroStats(state.realm.heroes, hero.id);
  const gear = source.gear.find((x) => x.id === gearId)!,
    equipped = owned?.equipment;
  const tier = equipped ? source.enhance.find((x) => x.level === equipped.level + 1) : undefined;
  const xp = source.expItems[String(book)];
  const starCost = owned ? hero.starCost[owned.star] : 0;
  return (
    <article className={styles.detail} aria-label="تفاصيل البطل المختار">
      <div className={styles.character}>
        <img src={hero.image || hero.portrait} alt={hero.name} />
        <div>
          <span className={styles.rarity}>
            {['', '', 'نادر', 'ملحمي', 'أسطوري'][hero.rarity] ?? 'بطل'}
          </span>
          <h3>{hero.name}</h3>
          <p>
            {owned
              ? `المستوى ${owned.level} · النجوم ${stats?.visibleStars}/5`
              : 'اجمع الشظايا لينضم إلى جيشك'}
          </p>
        </div>
      </div>
      {owned && stats ? (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>الهجوم</dt>
              <dd>{stats.attack.toLocaleString('ar-SA')}</dd>
            </div>
            <div>
              <dt>الدفاع</dt>
              <dd>{stats.defense.toLocaleString('ar-SA')}</dd>
            </div>
            <div>
              <dt>القيادة</dt>
              <dd>{stats.command.toLocaleString('ar-SA')}</dd>
            </div>
          </dl>
          <div className={styles.block}>
            <h4>تطوير القائد</h4>
            <p>
              خبرة المستوى: {owned.xp.toLocaleString('ar-SA')} /{' '}
              {source.levelCosts[String(hero.rarity)][String(owned.level)]?.toLocaleString(
                'ar-SA',
              ) ?? 'الحد الأقصى'}{' '}
              · سقف النجوم الحالي {stats.maxLevel}
            </p>
            <div className={styles.controls}>
              <label>
                كتاب الخبرة
                <select value={book} onChange={(e) => setBook(Number(e.target.value))}>
                  {Object.entries(source.expItems).map(([id, n]) => (
                    <option key={id} value={id}>
                      {n.toLocaleString('ar-SA')} خبرة · المتاح {state.balances[id] ?? 0}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                العدد
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={count}
                  onChange={(e) =>
                    setCount(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))
                  }
                />
              </label>
            </div>
            <div className={styles.actions}>
              <button
                disabled={
                  busy || owned.level >= stats.maxLevel || (state.balances[book] ?? 0) < count
                }
                onClick={() =>
                  void send({ type: 'hero-train', heroId: hero.id, itemId: book, count })
                }
              >
                تدريب البطل
              </button>
              <small>+{(xp * count).toLocaleString('ar-SA')} خبرة</small>
              <button
                disabled={busy || !starCost || (state.balances[hero.fragment] ?? 0) < starCost}
                onClick={() => void send({ type: 'hero-star', heroId: hero.id })}
              >
                ترقية النجوم
              </button>
              <small>
                {starCost
                  ? `${state.balances[hero.fragment] ?? 0}/${starCost} شظية`
                  : 'اكتملت النجوم'}
              </small>
            </div>
          </div>
          <div className={styles.block}>
            <h4>مهارات القائد</h4>
            <p>
              {hero.skill.name} · المهارة الفطرية تتحسن مع النجوم. تطوير المهارات المكتسبة يستهلك
              كتب الخبرة الصغيرة.
            </p>
            <div className={styles.skills}>
              {owned.skills.map((skill, slot) => {
                const unlocked = owned.level >= source.skillUnlocks[slot];
                const choice = choices[slot] ?? hero.recommended[slot - 1];
                const skillCost = skill
                  ? source.skills.find((x) => x.id === skill.id && x.level === skill.level)?.exp
                  : 0;
                return (
                  <div key={slot}>
                    <strong>{slot === 0 ? 'فطرية' : `مهارة ${slot + 1}`}</strong>
                    <span>
                      {skill
                        ? `${slot === 0 ? hero.skill.name : itemName(skill.id)} · مستوى ${skill.level}`
                        : unlocked
                          ? 'غير متعلمة'
                          : `تفتح عند المستوى ${source.skillUnlocks[slot]}`}
                    </span>
                    {slot > 0 && unlocked ? (
                      <>
                        <select
                          aria-label={`اختيار المهارة ${slot + 1}`}
                          disabled={!!skill || busy}
                          value={skill?.id ?? choice}
                          onChange={(e) =>
                            setChoices({ ...choices, [slot]: Number(e.target.value) })
                          }
                        >
                          {hero.recommended.map((id) => (
                            <option key={id} value={id}>
                              {itemName(id)} · {state.balances[id] ?? 0}
                            </option>
                          ))}
                        </select>
                        <button
                          disabled={
                            busy ||
                            (!skill
                              ? (state.balances[choice] ?? 0) < 1
                              : !skillCost ||
                                skill.level >= source.skillCaps[stats.visibleStars] ||
                                (state.balances['110026'] ?? 0) <
                                  Math.ceil((skillCost - skill.xp) / 30))
                          }
                          onClick={() =>
                            void send({
                              type: 'hero-skill',
                              heroId: hero.id,
                              slot,
                              ...(skill ? {} : { skillId: choice }),
                            })
                          }
                        >
                          {skill ? 'تطوير المهارة' : 'تعلم المهارة'}
                        </button>
                        {skill ? (
                          <button
                            className={styles.secondary}
                            disabled={busy}
                            onClick={() =>
                              void send({ type: 'hero-skill-forget', heroId: hero.id, slot })
                            }
                          >
                            نسيان واستعادة 60٪
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={styles.block}>
            <h4>تجهيز القائد</h4>
            <p>
              {equipped
                ? `${itemName(equipped.itemId)} · تعزيز ${equipped.level}`
                : 'لم تجهز قطعة بعد. اصنع قطعة من موادها أو استخدم قطعة من المخزن.'}
            </p>
            <label>
              قطعة التجهيز
              <select value={gearId} onChange={(e) => setGearId(Number(e.target.value))}>
                {source.gear.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · جودة {g.quality} · المتاح {state.balances[g.id] ?? 0}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.cost}>
              {gear.cost.map(([id, n], i) => (
                <span key={`${id}-${i}`}>
                  {itemName(id)}: {state.balances[id] ?? 0}/{n}{' '}
                </span>
              ))}
            </p>
            <div className={styles.actions}>
              <button
                disabled={
                  busy ||
                  state.castleLevel < Math.max(1, (gear.quality - 1) * 2 - 1) ||
                  !canPay(state.balances, gear.cost)
                }
                onClick={() => void send({ type: 'hero-craft-gear', itemId: gearId })}
              >
                صناعة التجهيز
              </button>
              <button
                disabled={
                  busy ||
                  ((state.balances[gearId] ?? 0) < 1 &&
                    !state.realm.heroes.spareEquipment.some((g) => g.itemId === gearId))
                }
                onClick={() => void send({ type: 'hero-equip', heroId: hero.id, itemId: gearId })}
              >
                تجهيز القطعة
              </button>
              <button
                disabled={busy || !tier || !canPay(state.balances, tier.cost)}
                onClick={() => void send({ type: 'hero-equip-upgrade', heroId: hero.id })}
              >
                تعزيز التجهيز
              </button>
            </div>
            {tier ? (
              <p className={styles.cost}>
                تكلفة التعزيز: {tier.cost.map(([id, n]) => `${itemName(id)} ×${n}`).join('، ')}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <div className={styles.block}>
          <h4>تجنيد البطل</h4>
          <p>
            الشظايا المملوكة: {state.balances[hero.fragment] ?? 0} من {hero.mergeCost}. تحصل على
            الشظايا من مكافآت المراحل والمهام.
          </p>
          <button
            disabled={busy || (state.balances[hero.fragment] ?? 0) < hero.mergeCost}
            onClick={() => void send({ type: 'hero-recruit', heroId: hero.id })}
          >
            تجنيد البطل
          </button>
        </div>
      )}
    </article>
  );
}
