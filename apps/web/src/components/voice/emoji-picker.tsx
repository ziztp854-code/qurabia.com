'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Star } from 'lucide-react';
import { VOICE_EMOJIS, emojiToken, type VoiceEmojiPack } from '@/lib/voice/emojis';
import { EmojiImage } from './emoji-content';
import styles from './emoji.module.css';

type Item = {
  value: string;
  label: string;
  id?: string;
  pack?: string;
  animated?: boolean;
};
type Preferences = { favorites: string[]; recent: string[] };
const cache = new Map<string, { at: number; packs: VoiceEmojiPack[] }>();
function readPreferences(userId: string): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(`tahaddi-emojis:v1:${userId}`) ?? '{}');
    const list = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === 'string' && v.length <= 42).slice(0, 48)
        : [];
    return { favorites: list(saved.favorites), recent: list(saved.recent) };
  } catch {
    return { favorites: [], recent: [] };
  }
}
export default function EmojiPicker({
  userId,
  onSelect,
  close,
}: {
  userId: string;
  onSelect: (value: string) => void;
  close: () => void;
}) {
  const [fresh] = useState(() => {
    const cached = cache.get(userId);
    return cached && Date.now() - cached.at < 60_000 ? cached.packs : null;
  });
  const [packs, setPacks] = useState<VoiceEmojiPack[]>(() => fresh ?? []);
  const [status, setStatus] = useState(() => (fresh ? '' : 'تحميل حزم تحدي لايف…'));
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [preferences, setPreferences] = useState<Preferences>(() => readPreferences(userId));
  const panel = useRef<HTMLDivElement>(null);
  const storageKey = `tahaddi-emojis:v1:${userId}`;
  const [page, setPage] = useState({ key: '', limit: 80 });
  const pageKey = `${tab}|${query}`;
  const visibleLimit = page.key === pageKey ? page.limit : 80;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector('input')?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [storageKey]);
  useEffect(() => {
    const controller = new AbortController();
    const cached = cache.get(userId);
    if (cached && Date.now() - cached.at < 60_000 && !retry) {
      return;
    }
    fetch('/api/voice/emojis', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data: VoiceEmojiPack[] = await response.json();
        if (!Array.isArray(data)) throw new Error();
        setPacks(data);
        if (cache.size > 5) cache.clear();
        cache.set(userId, { at: Date.now(), packs: data });
        setStatus('');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('تعذر تحميل الحزم. التعبيرات الأساسية متاحة.');
      });
    return () => controller.abort();
  }, [userId, retry]);
  const items = useMemo<Item[]>(
    () => [
      ...VOICE_EMOJIS.map(([value, label]) => ({ value, label })),
      ...packs.flatMap((pack) =>
        pack.emojis.map((emoji) => ({
          ...emoji,
          value: emojiToken(emoji.id),
          pack: pack.id,
        })),
      ),
    ],
    [packs],
  );
  const filtered = items.filter(
    (item) =>
      (tab === 'favorites'
        ? preferences.favorites.includes(item.value)
        : tab === 'recent'
          ? preferences.recent.includes(item.value)
          : tab === 'animated'
            ? item.animated
            : tab === 'all' || item.pack === tab) && item.label.includes(query.trim()),
  );
  if (tab === 'recent')
    filtered.sort(
      (a, b) => preferences.recent.indexOf(a.value) - preferences.recent.indexOf(b.value),
    );
  function save(next: Preferences) {
    setPreferences(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Optional preference. */
    }
  }
  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label="لوحة الفيسات"
      tabIndex={-1}
      dir="rtl"
      className={styles.picker}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        } else if (event.key === 'Tab') {
          const controls = Array.from(
            panel.current?.querySelectorAll<HTMLElement>('button, input, [tabindex="0"]') ?? [],
          ).filter((control) => !control.hasAttribute('disabled'));
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <header>
        <div>
          <strong>عبّر بطريقتك</strong>
          <small>فيسات تحدي لايف</small>
        </div>
        <button type="button" aria-label="إغلاق الفيسات" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <input
        type="search"
        aria-label="البحث عن فيس"
        placeholder="ابحث عن تعبير…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.tabs} aria-label="أقسام الفيسات">
        {[
          ['all', 'التعبيرات'],
          ['favorites', 'المفضلة'],
          ['recent', 'الأخيرة'],
          ['animated', 'متحركة'],
          ...packs.map((pack) => [pack.id, pack.name]),
        ].map(([id, name]) => (
          <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
      </div>
      {status && (
        <p role="status">
          {status}
          {status.startsWith('تعذر') && (
            <button type="button" onClick={() => setRetry((r) => r + 1)}>
              إعادة المحاولة
            </button>
          )}
        </p>
      )}
      <div className={styles.grid}>
        {filtered.slice(0, visibleLimit).map((item) => (
          <div key={item.value} className={styles.tile}>
            <button
              type="button"
              aria-label={`إدراج ${item.label}`}
              onClick={() => {
                save({
                  ...preferences,
                  recent: [
                    item.value,
                    ...preferences.recent.filter((value) => value !== item.value),
                  ].slice(0, 48),
                });
                onSelect(item.value);
              }}
            >
              {item.id ? <EmojiImage id={item.id} label={item.label} /> : item.value}
            </button>
            <button
              type="button"
              className={styles.favorite}
              aria-label={`تفضيل ${item.label}`}
              aria-pressed={preferences.favorites.includes(item.value)}
              onClick={() =>
                save({
                  ...preferences,
                  favorites: preferences.favorites.includes(item.value)
                    ? preferences.favorites.filter((value) => value !== item.value)
                    : [item.value, ...preferences.favorites].slice(0, 48),
                })
              }
            >
              <Star size={12} />
            </button>
          </div>
        ))}
        {!filtered.length && <p>لا توجد فيسات هنا بعد.</p>}
      </div>
      {filtered.length > visibleLimit && (
        <button type="button" onClick={() => setPage({ key: pageKey, limit: visibleLimit + 80 })}>
          عرض المزيد من الفيسات
        </button>
      )}
      <small>حتى 12 فيسًا في الرسالة · ⭐ لحفظ المفضلة</small>
    </div>
  );
}
