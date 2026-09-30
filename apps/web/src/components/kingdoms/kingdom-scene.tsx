'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Building } from '@/lib/kingdoms/types';
import { number, type GameProps } from './shared';
import { sceneBuildings } from './kingdom-scene-state';
import styles from './kingdom-scene.module.css';

const Scene3D = dynamic(() => import('./kingdom-scene-3d').then((module) => module.KingdomScene3D), {
  ssr: false,
  loading: () => <p className={styles.loading} role="status">يُجهَّز مشهد المملكة…</p>,
});

export function KingdomScene({ view, village, onSelectBuilding }: Pick<GameProps, 'view' | 'village'> & {
  onSelectBuilding: (building: Building) => void;
}) {
  const [display, setDisplay] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const [selected, setSelected] = useState<Building | null>(null);
  const root = useRef<HTMLElement>(null);
  const buildings = useMemo(
    () => sceneBuildings(village, view.config, view.serverNow),
    [village, view.config, view.serverNow],
  );
  const builtCount = buildings.filter((building) => building.built).length;

  useEffect(() => {
    const supported = typeof window.WebGLRenderingContext !== 'undefined';
    if (!supported) {
      const frame = requestAnimationFrame(() => setDisplay('unsupported'));
      return () => cancelAnimationFrame(frame);
    }
    if (typeof IntersectionObserver === 'undefined') {
      const frame = requestAnimationFrame(() => setDisplay('ready'));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setDisplay('ready'); observer.disconnect(); }
    }, { rootMargin: '100px' });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  function select(building: Building) {
    setSelected(building);
    onSelectBuilding(building);
  }

  return <section ref={root} className={styles.scene} aria-label="مشهد المملكة ثلاثي الأبعاد">
    <header className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>المدينة الحية</p>
        <h2>{village.name}</h2>
        <p>مبانٍ حقيقية من قريتك؛ اسحب المشهد لتديره ثم اختر مبنى لإدارته.</p>
      </div>
      <span className={styles.count}>{number(builtCount)} / {number(buildings.length)} مبنى قائم</span>
    </header>
    {display === 'ready' ? <Scene3D buildings={buildings} selected={selected} onSelect={select} /> :
      <div className={styles.placeholder} role="status">
        {display === 'loading' ? 'يُجهَّز مشهد القرية عند ظهوره…' : 'العرض ثلاثي الأبعاد غير متاح هنا. يمكنك إدارة جميع المباني من القائمة.'}
      </div>}
    <div className={styles.legend} aria-label="دلالات المشهد">
      <span><i data-state="built" /> قائم</span>
      <span><i data-state="busy" /> قيد البناء</span>
      <span><i data-state="vacant" /> أرض شاغرة</span>
    </div>
    <div className={styles.buildingList} aria-label="مباني المملكة">
      {buildings.map((building) => {
        const status = building.busy
          ? building.progressKnown
            ? `قيد البناء، ${Math.round(building.progress * 100).toLocaleString('ar-SA')}٪`
            : 'قيد البناء'
          : building.built ? `المستوى ${number(building.level)}` : 'لم يُبنَ';
        return <button
          type="button"
          key={building.key}
          className={styles.buildingButton}
          data-state={building.busy ? 'busy' : building.built ? 'built' : 'vacant'}
          aria-pressed={selected === building.key}
          aria-label={`${building.name}، ${status}`}
          onClick={() => select(building.key)}
        >
          <span>{building.name}</span>
          <small>{status}</small>
        </button>;
      })}
    </div>
  </section>;
}
