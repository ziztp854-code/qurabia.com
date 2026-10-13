'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ArrowRight } from 'lucide-react';
import { citySceneAsset, cityScenes, type CitySceneKey } from './city-scenes';
import styles from './city-building-scene.module.css';
import { SultanPalaceScene } from './sultan-palace-scene';
import { SultanFarmScene } from './sultan-farm-scene';
import { FarmSceneContext } from './farm-scene-context';
import { sultanFarmCopy } from './sultan-farm-copy';
import type { GameProps } from '../shared';
import { SultanFarmWorld } from './sultan-farm-world';

type FarmSheetState = 'closed' | 'half' | 'full';

type CityBuildingSceneProps = {
  scene: CitySceneKey;
  onClose: () => void;
  children: ReactNode;
  garden?: ReactNode;
  farm?: GameProps;
};

export function CityBuildingScene(props: CityBuildingSceneProps) {
  const [palaceGarden, setPalaceGarden] = useState(false);
  if (props.scene === 'sultan-garden' && props.farm && !palaceGarden) {
    return (
      <SultanFarmWorld
        farm={props.farm}
        onClose={props.onClose}
        onGarden={() => setPalaceGarden(true)}
      />
    );
  }
  return <FacilityArtworkScene {...props} />;
}

export function FacilityArtworkScene({
  scene,
  onClose,
  children,
  garden,
  farm,
}: CityBuildingSceneProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [aspect, setAspect] = useState(scene === 'palace' ? 1670 / 942 : 1672 / 941);
  const [exiting, setExiting] = useState(false);
  const [farmSheet, setFarmSheet] = useState<FarmSheetState>('closed');
  const managingFarm = farmSheet !== 'closed';
  const [farmSelected, setFarmSelected] = useState(0);
  const [farmQuiet, setFarmQuiet] = useState(false);
  const farmFocus = useRef(new Set<(id: number) => void>());
  const registerFarmFocus = useCallback((listener: (id: number) => void) => {
    farmFocus.current.add(listener);
    return () => {
      farmFocus.current.delete(listener);
    };
  }, []);
  const selectFarm = useCallback(
    (id: number, options?: { focus?: boolean }) => {
      setFarmSelected(id);
      if (options?.focus !== false) {
        if (scene === 'sultan-garden') setFarmSheet((value) => (value === 'full' ? 'half' : value));
        farmFocus.current.forEach((listener) => listener(id));
      }
    },
    [scene],
  );
  const farmContext = useMemo(
    () => ({
      selected: farmSelected,
      select: selectFarm,
      registerFocus: registerFarmFocus,
      motionPaused: farmQuiet,
      setMotionPaused: setFarmQuiet,
    }),
    [farmSelected, selectFarm, registerFarmFocus, farmQuiet],
  );
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surface = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const manage = useRef<HTMLButtonElement>(null);
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
    const header = surface.current?.querySelector('header');
    const syncHeader = () => {
      if (!header || !surface.current) return;
      surface.current.style.setProperty(
        '--facility-header-height',
        `${header.getBoundingClientRect().height + 16}px`,
      );
    };
    const headerObserver =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(syncHeader);
    if (header) headerObserver?.observe(header);
    syncHeader();
    const syncViewport = () => {
      const viewport = window.visualViewport;
      if (!viewport || window.innerWidth > 1000) {
        surface.current?.style.removeProperty('--facility-viewport-height');
        surface.current?.style.removeProperty('--facility-viewport-top');
        return;
      }
      surface.current?.style.setProperty('--facility-viewport-height', `${viewport.height}px`);
      surface.current?.style.setProperty('--facility-viewport-top', `${viewport.offsetTop}px`);
    };
    syncViewport();
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    back.current?.focus({ preventScroll: true });
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      covered.forEach((element) => {
        element.inert = false;
      });
      document.body.style.overflow = scroll;
      headerObserver?.disconnect();
      window.visualViewport?.removeEventListener('resize', syncViewport);
      window.visualViewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
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
    <FarmSceneContext.Provider value={farm ? farmContext : null}>
      <section
        ref={surface}
        className={styles.scene}
        aria-label={`مشهد ${cityScenes[scene].title}`}
        data-city-scene={scene}
        data-scene={scene}
        data-farm-managing={scene === 'sultan-garden' ? managingFarm : undefined}
        data-farm-sheet={scene === 'sultan-garden' ? farmSheet : undefined}
        data-phase={exiting ? 'exiting' : loaded ? 'active' : 'entering'}
        dir="rtl"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (scene === 'sultan-garden' && managingFarm) {
              setFarmSheet('closed');
              manage.current?.focus({ preventScroll: true });
            } else onClose();
            return;
          }
          if (event.key !== 'Tab') return;
          const controls = Array.from(
            surface.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            ) ?? [],
          ).filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first && last) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last && first) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className={styles.artwork} style={{ '--scene-aspect': aspect } as CSSProperties}>
          {scene === 'palace' ? (
            <SultanPalaceScene garden={loaded ? garden : undefined}>
              <picture>
                <source
                  media="(max-width: 700px)"
                  srcSet={citySceneAsset(scene, true)}
                  type="image/webp"
                />
                <img
                  key={retry}
                  className={styles.image}
                  src={citySceneAsset(scene)}
                  alt=""
                  draggable={false}
                  decoding="async"
                  fetchPriority="high"
                  onLoad={() => {
                    setLoaded(true);
                    setFailed(false);
                  }}
                  onError={() => {
                    setFailed(true);
                    setLoaded(false);
                  }}
                />
              </picture>
            </SultanPalaceScene>
          ) : scene === 'sultan-garden' && farm ? (
            <SultanFarmScene {...farm}>
              <picture>
                <source
                  media="(max-width: 700px)"
                  srcSet={citySceneAsset(scene, true)}
                  type="image/webp"
                />
                <img
                  key={retry}
                  className={styles.image}
                  src={citySceneAsset(scene)}
                  alt=""
                  draggable={false}
                  decoding="async"
                  fetchPriority="high"
                  onLoad={() => {
                    setAspect(2048 / 1143);
                    setLoaded(true);
                    setFailed(false);
                  }}
                  onError={() => {
                    setFailed(true);
                    setLoaded(false);
                  }}
                />
              </picture>
            </SultanFarmScene>
          ) : (
            <>
              <picture>
                {scene === 'market' ? <>
            <source type="image/avif" srcSet="/game-art/kingdoms/city-scenes/market-768.avif 768w, /game-art/kingdoms/city-scenes/market-1280.avif 1280w, /game-art/kingdoms/city-scenes/market-1672.avif 1672w" sizes="(max-width: 1000px) and (min-height: 501px) calc(100vw - 32px), (max-width: 700px) calc(100vw - 32px), (max-width: 1000px) 62vw, calc(100vw - 30rem)" />
            <source type="image/webp" srcSet="/game-art/kingdoms/city-scenes/market-768.webp 768w, /game-art/kingdoms/city-scenes/market-1280.webp 1280w, /game-art/kingdoms/city-scenes/market-1672.webp 1672w" sizes="(max-width: 1000px) and (min-height: 501px) calc(100vw - 32px), (max-width: 700px) calc(100vw - 32px), (max-width: 1000px) 62vw, calc(100vw - 30rem)" />
          </> : <source media="(max-width: 700px)" srcSet={citySceneAsset(scene, true)} type="image/webp" />}
                {/* Scene artwork is independent of the overview texture. */}
                <img
                  key={retry}
                  className={styles.image}
                  src={citySceneAsset(scene)}
                  alt=""
                  draggable={false}
                  decoding="async"
                  fetchPriority="high"
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    setAspect(image.naturalWidth / Math.max(1, image.naturalHeight));
                    setLoaded(true);
                    setFailed(false);
                  }}
                  onError={() => {
                    setFailed(true);
                    setLoaded(false);
                  }}
                />
              </picture>
              {loaded && garden}
            </>
          )}
        </div>
        <div className={styles.veil} aria-hidden="true" />
        <header className={styles.header}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>مدينة السلطان</p>
            <h2 className={styles.title}>{cityScenes[scene].title}</h2>
          </div>
          <button
            ref={manage}
            type="button"
            className={styles.manageButton}
            aria-expanded={scene === 'sultan-garden' ? managingFarm : undefined}
            aria-controls={scene === 'sultan-garden' ? 'sultan-farm-management' : undefined}
            onClick={() => {
              if (scene === 'sultan-garden') {
                setFarmSheet((value) => (value === 'closed' ? 'half' : 'closed'));
                surface.current?.scrollTo?.({ top: 0, behavior: 'auto' });
              } else
                content.current?.scrollIntoView?.({
                  block: 'start',
                  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
                });
            }}
          >
            {scene === 'sultan-garden' && managingFarm
              ? sultanFarmCopy.shell.close
              : scene === 'sultan-garden'
                ? sultanFarmCopy.shell.manage
                : 'إدارة المرفق'}
          </button>
          <button
            ref={back}
            type="button"
            className={styles.backButton}
            disabled={exiting}
            onClick={returnToCity}
          >
            <ArrowRight size={20} aria-hidden="true" />
            {scene === 'sultan-garden' ? sultanFarmCopy.shell.back : 'العودة إلى المدينة'}
          </button>
        </header>
        {!loaded && (
          <div className={styles.status} role={failed ? 'alert' : 'status'}>
            {failed ? 'تعذر تحميل المشهد.' : 'تجهيز المشهد…'}
            {failed && (
              <button
                className={styles.retryButton}
                type="button"
                onClick={() => {
                  setFailed(false);
                  setRetry((value) => value + 1);
                }}
              >
                إعادة المحاولة
              </button>
            )}
          </div>
        )}
        <div
          ref={content}
          id={scene === 'sultan-garden' ? 'sultan-farm-management' : undefined}
          className={styles.content}
        >
          {scene === 'sultan-garden' && (
            <button
              type="button"
              className={styles.sheetHandle}
              aria-expanded={farmSheet === 'full'}
              onClick={() => setFarmSheet((value) => (value === 'full' ? 'half' : 'full'))}
            >
              <span aria-hidden="true" />
              {farmSheet === 'full' ? sultanFarmCopy.shell.collapse : sultanFarmCopy.shell.expand}
            </button>
          )}
          {children}
        </div>
      </section>
    </FarmSceneContext.Provider>
  );
}
