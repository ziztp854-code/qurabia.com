'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { getHeroCatalog } from '@/lib/alfazaa/realm/hero-catalog';
import { catalog } from '@/lib/alfazaa/domain/catalog';
import { canPay, itemName, type HeroPanelProps } from './hero-panel';
import styles from './hero-panel.module.css';
const source = getHeroCatalog();
export function HeroPanelFormation({ state, send, busy }: HeroPanelProps) {
  const current = state.realm.heroes;
  const [party, setParty] = useState(current.party),
    [troops, setTroops] = useState(
      current.troopCells.length
        ? current.troopCells
        : state.cells.flatMap((x, i) => (x?.kind === 'troop' ? [i] : [])).slice(0, 9),
    );
  const [type, setType] = useState(current.formationType),
    [note, setNote] = useState('');
  const formation = source.formations.find(
    (x) => x.type === type && x.level === (current.formationLevels[type] ?? 0),
  );
  const toggle = (id: number, values: number[], max: number, set: (next: number[]) => void) => {
    if (values.includes(id)) {
      set(values.filter((x) => x !== id));
      setNote('');
    } else if (values.length < max) {
      set([...values, id]);
      setNote('');
    } else setNote(`الحد الأقصى ${max}. أزل اختيارًا قبل إضافة آخر.`);
  };
  return (
    <div className={styles.formation}>
      <div className={styles.block}>
        <h3>قادة التشكيل · {party.length}/2</h3>
        <p>اختر قائدًا أو قائدين من أبطالك. خصائصهم تقوي وحدات المدينة في القتال.</p>
        <div className={styles.cards}>
          {Object.values(current.roster).map((h) => {
            const hero = source.heroes.find((x) => x.id === h.id)!;
            return (
              <button
                disabled={busy}
                className={styles.card}
                aria-pressed={party.includes(h.id)}
                key={h.id}
                onClick={() => toggle(h.id, party, 2, setParty)}
              >
                <img src={hero.portrait} alt="" />
                <span>{hero.name}</span>
                <small>مستوى {h.level}</small>
              </button>
            );
          })}
        </div>
        <label>
          نوع التشكيل
          <select value={type} onChange={(e) => setType(Number(e.target.value))}>
            {[1, 2, 3, 4].map((t, i) => (
              <option key={t} value={t} disabled={t !== 1 && !(current.formationLevels[t] > 0)}>
                {['الهجوم', 'الدفاع', 'الحياة', 'السرعة'][i]} · مستوى{' '}
                {current.formationLevels[t] ?? 0}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.actions}>
          <button
            disabled={busy || !party.length || !troops.length}
            onClick={() =>
              void send({
                type: 'hero-formation',
                heroIds: party,
                troopCells: troops,
                formationType: type,
              })
            }
          >
            حفظ تشكيل الجيش
          </button>
          <button
            disabled={busy || !formation?.nextId || !canPay(state.balances, formation.cost)}
            onClick={() => void send({ type: 'hero-formation-upgrade', formationType: type })}
          >
            ترقية التشكيل
          </button>
        </div>
        {formation ? (
          <p className={styles.cost}>
            الترقية:{' '}
            {formation.cost.map(([id, n]) => `${itemName(id)} ×${n}`).join('، ') || 'الحد الأقصى'}
          </p>
        ) : null}
        <div className={styles.actions}>
          {[2, 3, 4]
            .filter((t) => !(current.formationLevels[t] > 0))
            .map((t) => {
              const first = source.formations.find((x) => x.type === t && x.level === 0);
              return (
                <button
                  key={t}
                  disabled={busy || !first || !canPay(state.balances, first.cost)}
                  onClick={() => void send({ type: 'hero-formation-upgrade', formationType: t })}
                >
                  فتح تشكيل {['', '', 'الدفاع', 'الحياة', 'السرعة'][t]}
                </button>
              );
            })}
        </div>
      </div>
      <div className={styles.block}>
        <h3>وحدات المدينة · {troops.length}/9</h3>
        <p>اختر حتى تسعة مواضع. الوحدات المصابة تعود عبر العلاج والتدريب.</p>
        <div className={styles.citySlots}>
          {state.cells.map((cell, i) => {
            if (cell?.kind !== 'troop') return null;
            const arm = catalog.arms.find((x) => x.id === cell.cfgId);
            return (
              <button
                key={cell.id}
                className={styles.card}
                aria-pressed={troops.includes(i)}
                disabled={busy}
                onClick={() => toggle(i, troops, 9, setTroops)}
              >
                {arm ? <img src={arm.image} alt="" /> : null}
                <span>{arm?.name ?? cell.cfgId}</span>
                <small>موضع {i + 1}</small>
              </button>
            );
          })}
        </div>
        {state.cells.every((x) => x?.kind !== 'troop') ? (
          <p>جنّد وحدة من المدينة أو عالج المصابين أولًا.</p>
        ) : null}
        <h4>تحصين مواضع التشكيل</h4>
        <div className={styles.positions}>
          {Array.from({ length: 9 }, (_, position) => {
            const level = current.fortifications[`${type}:${position}`] ?? 0;
            const next = source.fortify.find(
              (x) => x.type === type && x.position === position && x.level === level + 1,
            );
            const allowed =
              !!formation?.positions.includes(position) &&
              !!next &&
              next.requirements.every((id) => {
                const cfg = source.formations.find((x) => x.id === id);
                return cfg && (current.formationLevels[cfg.type] ?? 0) >= cfg.level;
              });
            return (
              <button
                key={position}
                disabled={busy || !allowed || !next || !canPay(state.balances, next.cost)}
                onClick={() => void send({ type: 'hero-fortify', position })}
                title={
                  next
                    ? next.cost.map(([id, n]) => `${itemName(id)} ×${n}`).join('، ')
                    : 'اكتمل التحصين'
                }
              >
                موضع {position + 1}
                <small>
                  تحصين {level}
                  {!allowed ? ' · مغلق' : ''}
                </small>
              </button>
            );
          })}
        </div>
      </div>
      <p role="status">{note}</p>
    </div>
  );
}
