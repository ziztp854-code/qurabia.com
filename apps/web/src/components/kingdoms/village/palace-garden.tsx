'use client';

/* eslint-disable @next/next/no-img-element -- Calibrated alpha sprites and pre-generated small thumbnails preserve the artwork projection. */

import { useEffect, useRef, useState } from 'react';
import {
  gardenAsset, gardenCatalog, gardenCategories, gardenSlots, gardenViewSchema,
  type GardenCategory, type GardenItemId, type GardenPlacement, type PalaceGardenView,
} from '@/lib/kingdoms/palace-garden';
import styles from './palace-garden.module.css';

export type PalaceGardenProps = { worldId: string; villageId: string; playerId: string; onSaved?: () => void };

/** The parent stage must use the palace artwork's exact aspect ratio. */
export function PalaceGarden(props: PalaceGardenProps) {
  // A new identity gets a fresh tree before effects run, preventing one-frame leaks.
  return <GardenEditor key={`${props.worldId}:${props.villageId}:${props.playerId}`} {...props} />;
}

function GardenEditor({ worldId, villageId, playerId, onSaved }: PalaceGardenProps) {
  const [saved, setSaved] = useState<GardenPlacement[]>([]);
  const [draft, setDraft] = useState<GardenPlacement[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [category, setCategory] = useState<GardenCategory>('roses');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'failed'>('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [missingArt, setMissingArt] = useState<GardenItemId[]>([]);
  const saveController = useRef<AbortController | null>(null);
  const query = new URLSearchParams({ worldId, villageId }).toString();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const busy = phase === 'loading' || phase === 'saving';

  async function requestGarden(init: RequestInit, signal: AbortSignal): Promise<PalaceGardenView> {
    const response = await fetch(`/api/kingdoms/palace-garden${init.method === 'PUT' ? '' : `?${query}`}`, {
      ...init, signal, cache: 'no-store', credentials: 'same-origin',
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true)
      throw new Error(typeof payload.error === 'string' ? payload.error : 'تعذّر تحميل الحديقة.');
    const checked = gardenViewSchema.safeParse(payload.data);
    if (!checked.success) throw new Error('تعذّر قراءة بيانات الحديقة. أعد المحاولة.');
    const data = checked.data;
    if (data.worldId !== worldId || data.villageId !== villageId || data.playerId !== playerId)
      throw new Error('تعذّر التحقق من ملكية الحديقة.');
    return data;
  }

  useEffect(() => {
    const controller = new AbortController();
    void requestGarden({}, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setSaved(data.slots); setDraft(data.slots); setPhase('ready'); setError('');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setPhase('failed'); setError(cause instanceof Error ? cause.message : 'تعذّر تحميل الحديقة.');
    });
    return () => { controller.abort(); saveController.current?.abort(); };
    // The keyed editor fixes its world, village and player for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  function place(itemId: GardenItemId) {
    if (selected === null || busy || missingArt.includes(itemId)) return;
    setDraft((current) => [...current.filter((item) => item.slotId !== selected), { slotId: selected, itemId }]
      .sort((a, b) => a.slotId - b.slotId));
    setNotice(''); setError('');
  }

  async function save() {
    if (!dirty || busy) return;
    const controller = new AbortController();
    saveController.current = controller;
    setPhase('saving'); setError(''); setNotice('');
    try {
      await requestGarden({ method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId, villageId, slots: draft }),
      }, controller.signal);
      const reloaded = await requestGarden({}, controller.signal);
      if (controller.signal.aborted) return;
      setSaved(reloaded.slots); setDraft(reloaded.slots); setEditing(false); setSelected(null);
      setPhase('ready'); setNotice('حُفظت حديقتك.');
      onSaved?.();
    } catch (cause: unknown) {
      if (controller.signal.aborted) return;
      setPhase('ready'); setError(cause instanceof Error ? cause.message : 'تعذّر حفظ الحديقة. حاول مجددًا.');
    } finally {
      if (saveController.current === controller) saveController.current = null;
    }
  }

  function artFailed(id: GardenItemId) {
    setMissingArt((current) => current.includes(id) ? current : [...current, id]);
  }

  return <section className={styles.garden} aria-label="حديقة السلطان" dir="rtl" data-testid="palace-garden">
    <div className={styles.art} aria-label="تنسيق الحديقة">
      {(editing ? draft : saved).map(({ slotId, itemId }) => {
        const slot = gardenSlots[slotId], item = gardenCatalog.find((entry) => entry.id === itemId)!;
        const depth = 1 + Math.floor(slotId / 4) * 0.12;
        return !missingArt.includes(itemId) && <img key={slotId} className={styles.plant}
          src={gardenAsset(itemId, { variation: slotId })} alt={`${item.name} في مساحة ${slotId + 1}`}
          style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%`, width: `${item.width * depth * 100}%`, height: `${item.height * depth * 100}%`, zIndex: 1 + Math.floor(slotId / 4) }}
          onError={() => artFailed(itemId)} draggable={false} />;
      })}
      {editing && gardenSlots.map((slot) => <button key={slot.id} type="button"
        className={styles.slot} aria-label={`مساحة الحديقة ${slot.id + 1}`} aria-pressed={selected === slot.id}
        disabled={busy} onClick={() => setSelected(slot.id)}
        style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%` }}><span>{slot.id + 1}</span></button>)}
    </div>
    <div className={styles.controls}>
      {phase === 'loading' && <p role="status">جارٍ تحميل حديقتك…</p>}
      {phase === 'failed' && <button type="button" onClick={() => { setPhase('loading'); setAttempt((value) => value + 1); }}>إعادة تحميل الحديقة</button>}
      {phase === 'ready' && !editing && <button type="button" className={styles.primary} onClick={() => { setEditing(true); setNotice(''); }}>تخصيص الحديقة</button>}
      {editing && <>
        <div className={styles.heading}><strong>حديقة السلطان</strong><span>{dirty ? 'تغييرات غير محفوظة' : 'اختر مساحة ثم عنصرًا'}</span></div>
        <label className={styles.selector}>مساحة الحديقة
          <select aria-label="اختيار مساحة الحديقة" value={selected ?? ''} disabled={busy} onChange={(event) => setSelected(event.target.value === '' ? null : Number(event.target.value))}>
            <option value="">اختر مساحة</option>
            {gardenSlots.map((slot) => <option value={slot.id} key={slot.id}>مساحة {slot.id + 1}</option>)}
          </select>
        </label>
        <div className={styles.categories} aria-label="فئات زينة الحديقة">
          {gardenCategories.map((entry) => <button key={entry.id} type="button" aria-pressed={category === entry.id}
            disabled={busy} onClick={() => setCategory(entry.id)}>{entry.name}</button>)}
        </div>
        <div className={styles.catalog} aria-label="مكتبة الحديقة">
          {gardenCatalog.filter((item) => item.category === category).map((item) => <button type="button" key={item.id}
            aria-label={item.name} disabled={selected === null || busy || missingArt.includes(item.id)}
            aria-pressed={draft.some((slot) => slot.slotId === selected && slot.itemId === item.id)} onClick={() => place(item.id)}>
            <img src={gardenAsset(item.id, { thumbnail: true })} alt="" loading="lazy" onError={() => artFailed(item.id)} /><span>{item.name}</span>
          </button>)}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={busy || !dirty} onClick={() => void save()}>{phase === 'saving' ? 'جارٍ الحفظ…' : 'حفظ الحديقة'}</button>
          <button type="button" disabled={busy} onClick={() => { setDraft(saved); setEditing(false); setSelected(null); setError(''); }}>إلغاء التعديل</button>
          <button type="button" disabled={selected === null || busy || !draft.some((slot) => slot.slotId === selected)} onClick={() => { setDraft((current) => current.filter((slot) => slot.slotId !== selected)); setNotice(''); }}>إفراغ المساحة</button>
        </div>
      </>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {missingArt.length > 0 && <p role="status">تعذّر تحميل بعض صور الحديقة. أعد فتح المشهد للمحاولة مجددًا.</p>}
    </div>
  </section>;
}
