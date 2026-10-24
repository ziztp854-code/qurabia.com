'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Shield, Search } from 'lucide-react';
import styles from './resources.module.css';
interface Hero {
  id: string | number;
  name: string;
  description?: string;
  rarity?: string | number;
  type?: string | number;
  portrait: string;
  image?: string;
  stats?: { name: string; value: string | number }[];
  skills?: { name: string; description?: string }[];
}
export function HeroGallery() {
  const detail = useRef<HTMLHeadingElement>(null);
  const [heroes, setHeroes] = useState<Hero[]>([]),
    [selected, setSelected] = useState<Hero | null>(null),
    [query, setQuery] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch('/game-art/alfazaa/heroes-index.json', { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setHeroes(data.heroes);
        setSelected(data.heroes[0] || null);
      })
      .catch((cause) => {
        if (cause.name !== 'AbortError')
          setError('تعذّر فتح دليل الأبطال. أعد فتح القسم للمحاولة.');
      });
    return () => abort.abort();
  }, []);
  const matches = useMemo(
    () =>
      heroes.filter((hero) =>
        `${hero.name} ${hero.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()),
      ),
    [heroes, query],
  );
  const choose = (hero: Hero) => {
    setSelected(hero);
    if (window.matchMedia('(max-width:600px)').matches)
      requestAnimationFrame(() => {
        detail.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
        detail.current?.focus({ preventScroll: true });
      });
  };
  return (
    <section className={styles.section} aria-label="أبطال الفزعة">
      <header className={styles.heading}>
        <Shield size={30} />
        <div>
          <h2>أبطال الفزعة</h2>
          <p>
            {heroes.length
              ? `${heroes.length.toLocaleString('ar-SA')} بطلًا من بيانات اللعبة وصورها الأصلية.`
              : 'جارٍ فتح دليل الأبطال…'}
          </p>
        </div>
      </header>
      <p className={styles.note}>
        دليل الأبطال ومهاراتهم. استعراض البطل هنا لا يضيفه إلى مقتنيات حسابك.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={styles.heroLayout}>
        <aside className={styles.heroDetail} aria-label="تفاصيل البطل">
          {selected && (
            <>
              <div className={styles.heroImage}>
                <img src={selected.image || selected.portrait} alt={selected.name} />
              </div>
              <h3 ref={detail} tabIndex={-1}>
                {selected.name}
              </h3>
              {selected.description && <p>{selected.description}</p>}
              <dl className={styles.stats}>
                {selected.stats?.map((stat, index) => (
                  <div key={`${stat.name}-${index}`}>
                    <dt>{stat.name}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
              {selected.skills?.map((skill, index) => (
                <article className={styles.skill} key={`${skill.name}-${index}`}>
                  <h4>{skill.name}</h4>
                  {skill.description && <p>{skill.description}</p>}
                </article>
              ))}
            </>
          )}
        </aside>
        <div>
          <div className={styles.filters}>
            <label>
              <Search size={18} />
              <input
                aria-label="البحث عن بطل"
                placeholder="ابحث عن بطل"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <p className={styles.count} role="status">
            {matches.length.toLocaleString('ar-SA')} بطلًا
          </p>
          <div className={styles.heroes}>
            {matches.map((hero) => (
              <button
                className={`${styles.heroTile} ${selected?.id === hero.id ? styles.chosen : ''}`}
                key={hero.id}
                onClick={() => choose(hero)}
                aria-pressed={selected?.id === hero.id}
              >
                <img src={hero.portrait} alt="" loading="lazy" decoding="async" />
                <strong>{hero.name}</strong>
              </button>
            ))}
          </div>
          {heroes.length > 0 && !matches.length && (
            <p className={styles.empty}>لم يُعثر على هذا البطل.</p>
          )}
        </div>
      </div>
    </section>
  );
}
