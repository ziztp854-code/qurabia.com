'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { VoiceEmojiPack } from '@/lib/voice/emojis';
import styles from './emoji-admin.module.css';

export function VoiceEmojiAdmin() {
  const [packs, setPacks] = useState<VoiceEmojiPack[]>([]);
  const [name, setName] = useState('');
  const [packId, setPackId] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/admin/voice-emojis', {
      cache: 'no-store',
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر تحميل الحزم.');
    return data as VoiceEmojiPack[];
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then(setPacks)
      .catch((error) => {
        if (!controller.signal.aborted) setStatus(String(error));
      });
    return () => controller.abort();
  }, [load]);
  async function act(url: string, init: RequestInit) {
    if (busy) return;
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(url, init);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر الحفظ.');
      setPacks(await load());
      setStatus('تم الحفظ بنجاح.');
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'تعذر الحفظ.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size > 512 * 1024 || file.type !== 'image/webp') {
      setStatus('اختر WebP بحجم أقصى 512 كيلوبايت.');
      return;
    }
    if (
      await act('/api/admin/voice-emojis/upload', {
        method: 'POST',
        body: data,
      })
    )
      form.reset();
  }
  return (
    <section dir="rtl" className={styles.admin}>
      <header>
        <p>تحدي لايف · إدارة المحتوى</p>
        <h1>حزم الفيسات</h1>
        <p>تعبيرات حصرية تضيف شخصية للسوالف.</p>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act('/api/admin/voice-emojis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          }).then((ok) => {
            if (ok) setName('');
          });
        }}
      >
        <h2>حزمة جديدة</h2>
        <label>
          اسم الحزمة
          <input
            required
            minLength={2}
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button disabled={busy}>إنشاء الحزمة</button>
      </form>
      <form onSubmit={upload}>
        <h2>إضافة فيس ثابت أو متحرك</h2>
        <label>
          الحزمة
          <select
            name="packId"
            required
            value={packId}
            onChange={(event) => setPackId(event.target.value)}
          >
            <option value="">اختر الحزمة</option>
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          وصف الفيس
          <input name="label" required maxLength={40} />
        </label>
        <label>
          ملف WebP
          <input type="file" name="file" accept="image/webp" required />
        </label>
        <small>
          256×256 بكسل · 512 كيلوبايت · 60 إطارًا · ست ثوانٍ كحد أقصى. تُنشأ نسخة ثابتة لتقليل
          الحركة.
        </small>
        <button disabled={busy || !packId}>رفع الفيس</button>
      </form>
      {status && <p role="status">{status}</p>}
      <div className={styles.packs}>
        {packs.map((pack) => (
          <article key={pack.id}>
            <h2>{pack.name}</h2>
            <p>
              {pack.emojis.length} / 40 فيسًا · {pack.enabled ? 'مفعّلة' : 'معطّلة'}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void act('/api/admin/voice-emojis', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: pack.id, enabled: !pack.enabled }),
                })
              }
            >
              {pack.enabled ? 'تعطيل الحزمة' : 'تفعيل الحزمة'}
            </button>
            <ul>
              {pack.emojis.map((emoji) => (
                <li key={emoji.id}>
                  {emoji.label}
                  {emoji.animated ? ' · متحرك' : ' · ثابت'}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
