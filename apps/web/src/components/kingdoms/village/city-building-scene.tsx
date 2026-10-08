'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { citySceneAsset, cityScenes, type CitySceneKey } from './city-scenes';
import styles from './city-building-scene.module.css';
import { SultanPalaceScene } from './sultan-palace-scene';

export function CityBuildingScene({ scene, onClose, children, garden }: {
  scene: CitySceneKey;
  onClose: () => void;
  children: ReactNode;
  garden?: ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [aspect, setAspect] = useState(scene === 'palace' ? 1670 / 942 : 1672 / 941);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surface = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Disable only sibling branches, preserving the retained city and its camera.
    const covered: HTMLElement[] = [];
    let branch: HTMLElement | null = surface.current;
    while (branch?.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling instanceof HTMLElement && sibling !== branch && !sibling.inert) {
          sibling.inert = true;
          covered.push(sibling);
        }
      }
      branch = parent;
    }
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    back.current?.focus({ preventScroll: true });
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      covered.forEach((element) => { element.inert = false; });
      document.body.style.overflow = scroll;
    };
  }, []);
  function returnToCity(event: MouseEvent<HTMLButtonElement>) {
    if (exiting) return;
    if (event.detail === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setExiting(true);
    exitTimer.current = setTimeout(onClose, 160);
  }
  return (
    <section ref={surface} className={styles.scene} aria-label={`مشهد ${cityScenes[scene].title}`} data-city-scene={scene} data-scene={scene} data-phase={exiting ? 'exiting' : loaded ? 'active' : 'entering'} dir="rtl" onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(surface.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])
        .filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
    }}>
      <div className={styles.artwork} style={{ '--scene-aspect': aspect } as CSSProperties}>
        {scene === 'palace' ? <SultanPalaceScene garden={loaded ? garden : undefined}>
          <picture>
            <source media="(max-width: 700px)" srcSet={citySceneAsset(scene, true)} type="image/webp" />
            <img key={retry} className={styles.image} src={citySceneAsset(scene)} alt="" draggable={false} decoding="async" fetchPriority="high"
              onLoad={() => { setLoaded(true); setFailed(false); }} onError={() => { setFailed(true); setLoaded(false); }} />
          </picture>
        </SultanPalaceScene> : <><picture>
          <source media="(max-width: 700px)" srcSet={citySceneAsset(scene, true)} type="image/webp" />
          {/* Scene artwork is independent of the overview texture. */}
          <img key={retry} className={styles.image} src={citySceneAsset(scene)} alt="" draggable={false} decoding="async" fetchPriority="high" onLoad={(event) => {
            const image = event.currentTarget;
            setAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
            setLoaded(true);
            setFailed(false);
          }} onError={() => { setFailed(true); setLoaded(false); }} />
        </picture>
        {loaded && garden}</>}
      </div>
      <div className={styles.veil} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.heading}><p className={styles.eyebrow}>مدينة السلطان</p><h2 className={styles.title}>{cityScenes[scene].title}</h2></div>
        <button type="button" className={styles.manageButton} onClick={() => content.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })}>إدارة المرفق</button>
        <button ref={back} type="button" className={styles.backButton} disabled={exiting} onClick={returnToCity}><ArrowRight size={20} aria-hidden="true" />العودة إلى المدينة</button>
      </header>
      {!loaded && <div className={styles.status} role={failed ? 'alert' : 'status'}>
        {failed ? 'تعذر تحميل المشهد.' : 'تجهيز المشهد…'}
        {failed && <button className={styles.retryButton} type="button" onClick={() => { setFailed(false); setRetry((value) => value + 1); }}>إعادة المحاولة</button>}
      </div>}
      <div ref={content} className={styles.content}>{children}</div>
    </section>
  );
}
