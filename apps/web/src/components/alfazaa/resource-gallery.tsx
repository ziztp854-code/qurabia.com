'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Download, Images } from 'lucide-react';
import { filterResources, type ResourceImage } from './resource-index';
import styles from './resources.module.css';
const labels: Record<string, string> = {
  heroes: 'الأبطال',
  troops: 'الجنود',
  buildings: 'المباني',
  ui: 'الواجهة',
  maps: 'الخرائط',
  atlas: 'أطالس الصور',
  atlases: 'أطالس الصور',
  other: 'صور أخرى',
};
type Index = { items: ResourceImage[]; meta: Record<string, unknown> };
export function ResourceGallery() {
  const [index, setIndex] = useState<Index | null>(null),
    [error, setError] = useState('');
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ResourceImage | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/game-art/alfazaa/archive-index.json', { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('تعذّر فتح فهرس الصور.');
        return response.json();
      })
      .then(setIndex)
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError('تعذّر فتح فهرس الصور. أعد فتح القسم للمحاولة.');
      });
    return () => abort.abort();
  }, []);
  const result = useMemo(
    () => filterResources(index?.items || [], query, category, page),
    [index, query, category, page],
  );
  const categories = useMemo(
    () => [...new Set(index?.items.map((item) => item.category) || [])],
    [index],
  );
  const open = (item: ResourceImage) => {
    setSelected(item);
    dialog.current?.showModal();
  };
  return (
    <section className={styles.section} aria-label="أرشيف صور اللعبة">
      <header className={styles.heading}>
        <Images size={30} />
        <div>
          <h2>جميع صور اللعبة</h2>
          <p>
            {index
              ? `${index.items.length.toLocaleString('ar-SA')} صورة أصلية؛ تُحمّل المعاينات عند عرضها.`
              : 'جارٍ فتح فهرس الموارد…'}
          </p>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className={styles.filters}>
        <label>
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="اسم الصورة أو مسارها الأصلي"
            aria-label="البحث في جميع الصور"
          />
        </label>
        <select
          aria-label="فئة الصور"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">جميع الفئات</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {labels[value] || value}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.count} role="status">
        {result.total.toLocaleString('ar-SA')} نتيجة · صفحة {result.page} من {result.pages}
      </p>
      <div className={styles.gallery}>
        {result.items.map((item) => (
          <button
            key={item.id}
            className={styles.tile}
            onClick={() => open(item)}
            aria-label={`معاينة ${item.name}`}
          >
            <span className={styles.imageSurface}>
              <img src={item.url} alt="" loading="lazy" decoding="async" />
            </span>
            <strong dir="auto">{item.name}</strong>
            <small>
              {item.width} × {item.height} · {labels[item.category] || item.category}
            </small>
          </button>
        ))}
      </div>
      {index && !result.total && (
        <p className={styles.empty}>لا توجد صور مطابقة. جرّب كلمة أو فئة أخرى.</p>
      )}
      <div className={styles.pagination}>
        <button disabled={result.page <= 1} onClick={() => setPage(result.page - 1)}>
          السابق
        </button>
        <span>
          {result.page} / {result.pages}
        </span>
        <button disabled={result.page >= result.pages} onClick={() => setPage(result.page + 1)}>
          التالي
        </button>
      </div>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-label="معاينة الصورة الأصلية"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {selected && (
          <div className={styles.preview}>
            <header>
              <strong dir="auto">{selected.name}</strong>
              <button aria-label="إغلاق معاينة الصورة" onClick={() => dialog.current?.close()}>
                <X size={22} />
              </button>
            </header>
            <div className={styles.original}>
              <img src={selected.url} alt={selected.name} />
            </div>
            <footer>
              <span>
                {selected.width} × {selected.height} بكسل · {(selected.bytes / 1024).toFixed(1)}{' '}
                كيلوبايت
              </span>
              <a href={selected.url} download>
                <Download size={17} />
                تحميل الأصل
              </a>
            </footer>
          </div>
        )}
      </dialog>
    </section>
  );
}
