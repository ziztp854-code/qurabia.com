'use client';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { farmState, farmCrops, farmGrowth, farmStageNames } from '@/lib/kingdoms/sultan-farm';
import {
  farmBeds,
  farmBedPoint,
  farmBedBounds,
  FARM_WORLD,
} from '@/lib/kingdoms/village/farm-scene-layout';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { unprojectPoint } from '@/lib/kingdoms/village/cameraMath';
import type { GameProps } from '../shared';
import { useViewClock } from '../use-view-clock';
import { VillageCamera } from './village-camera';
import { FarmSceneContext } from './farm-scene-context';
import type { createSultanFarmRenderer } from './sultan-farm-renderer';
import styles from './sultan-farm-scene.module.css';

export function SultanFarmScene({ children, view, village }: GameProps & { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null),
    mount = useRef<HTMLDivElement>(null),
    world = useRef<HTMLDivElement>(null);
  const camera = useRef<VillageCamera | null>(null),
    renderer = useRef<Awaited<ReturnType<typeof createSultanFarmRenderer>> | null>(null);
  const context = useContext(FarmSceneContext),
    selected = context?.selected ?? 0;
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [localQuiet, setLocalQuiet] = useState(false);
  const quiet = context?.motionPaused ?? localQuiet,
    setQuiet = context?.setMotionPaused ?? setLocalQuiet;
  const farm = farmState(village),
    latest = useRef(farm),
    latestNow = useRef(view.serverNow);
  const now = useViewClock(
    view,
    Math.max(view.serverNow, ...farm.plots.map((p) => p.plant?.readyAt ?? 0)),
    `farm-art:${view.worldId}:${village.id}`,
  );
  const paused = useRef(view.paused || quiet);
  const select = useRef(context?.select);
  const choose = context?.select;
  const registerFocus = context?.registerFocus;
  useEffect(() => {
    latest.current = farm;
    latestNow.current = now;
    paused.current = view.paused || quiet;
    select.current = choose;
  }, [farm, now, view.paused, quiet, choose]);
  useEffect(() => {
    const element = host.current,
      container = mount.current;
    if (!element || !container) return;
    let disposed = false;
    const surface = document.createElement('canvas');
    surface.className = styles.canvas;
    surface.setAttribute('aria-hidden', 'true');
    container.appendChild(surface);
    const instance = new VillageCamera(
      { width: element.clientWidth, height: element.clientHeight },
      false,
      FARM_WORLD,
    );
    camera.current = instance;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const device = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const quality = resolveVillageQuality('auto', {
      width: element.clientWidth,
      height: element.clientHeight,
      dpr: devicePixelRatio,
      memory: device.deviceMemory,
      cores: device.hardwareConcurrency,
      saveData: device.connection?.saveData,
    });
    const unsubscribe = instance.subscribe((s) => {
      if (world.current)
        world.current.style.transform = `matrix(${s.scale},0,0,${s.scale},${s.viewport.width / 2 - s.x * s.scale},${s.viewport.height / 2 - s.y * s.scale})`;
      element.dataset.farmZoom = String(s.zoom);
    });
    const updateMotion = () => {
      instance.reducedMotion = motion.matches;
      renderer.current?.setMotion(!motion.matches && !paused.current && quality.mode !== 'low');
    };
    motion.addEventListener('change', updateMotion);
    updateMotion();
    const offFocus = registerFocus?.((id) => instance.focusRect(farmBedBounds(id), 3));
    const updateSize = () => renderer.current?.resize(element.clientWidth, element.clientHeight);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    if (resize) resize.observe(element);
    else window.addEventListener('resize', updateSize);
    void import('./sultan-farm-renderer')
      .then((m) => m.createSultanFarmRenderer(surface, element, instance, quality))
      .then((runtime) => {
        if (disposed) {
          runtime.destroy();
          return;
        }
        renderer.current = runtime;
        runtime.resize(element.clientWidth, element.clientHeight);
        runtime.update(latest.current, latestNow.current);
        updateMotion();
        setReady(true);
        surface.dataset.farmQuality = quality.mode;
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    const points = new Map<number, { x: number; y: number }>();
    let dragged = false,
      origin: { x: number; y: number } | null = null;
    const local = (event: PointerEvent | WheelEvent) => {
      const r = element.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    };
    const distance = () => {
      const [a, b] = [...points.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('button') || e.button !== 0 || points.size >= 2) return;
      const p = local(e);
      points.set(e.pointerId, p);
      origin = p;
      dragged = points.size > 1;
      element.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      const prev = points.get(e.pointerId);
      if (!prev) return;
      const p = local(e),
        before = distance();
      points.set(e.pointerId, p);
      if (origin && Math.hypot(p.x - origin.x, p.y - origin.y) > 5) dragged = true;
      if (points.size === 2) {
        const [a, b] = [...points.values()],
          after = distance();
        if (before > 0) instance.zoomAt(after / before, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      } else if (dragged) instance.panBy(p.x - prev.x, p.y - prev.y);
    };
    const up = (e: PointerEvent) => {
      const p = points.get(e.pointerId);
      if (!p) return;
      points.delete(e.pointerId);
      if (e.type === 'pointerup' && !dragged) {
        const w = unprojectPoint(p, instance.getSnapshot());
        for (let id = 0; id < 12; id++) {
          const polygon = farmBeds[id];
          let inside = false;
          for (let i = 0, j = 3; i < 4; j = i++) {
            const a = polygon[i],
              b = polygon[j];
            if (
              a[1] > w.y !== b[1] > w.y &&
              w.x < ((b[0] - a[0]) * (w.y - a[1])) / (b[1] - a[1]) + a[0]
            )
              inside = !inside;
          }
          if (inside) {
            select.current?.(id);
            break;
          }
        }
      }
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      if (!points.size) origin = null;
    };
    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest('button')) return;
      e.preventDefault();
      instance.zoomAt(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002), local(e));
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      disposed = true;
      resize?.disconnect();
      window.removeEventListener('resize', updateSize);
      motion.removeEventListener('change', updateMotion);
      offFocus?.();
      unsubscribe();
      instance.destroy();
      camera.current = null;
      renderer.current?.destroy();
      renderer.current = null;
      surface.remove();
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      element.removeEventListener('wheel', wheel);
      points.clear();
    };
  }, [registerFocus]);
  useEffect(() => {
    renderer.current?.update(farm, now);
  }, [farm, now]);
  useEffect(() => {
    renderer.current?.setMotion(
      !view.paused &&
        !quiet &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
        renderer.current !== null,
    );
  }, [view.paused, quiet]);
  const current = farm.plots[selected],
    growth = current.plant ? farmGrowth(current.plant, now) : null;
  return (
    <div className={styles.frame} data-sultan-farm="" data-pixi-farm={ready}>
      <div
        ref={host}
        className={styles.viewport}
        role="application"
        aria-label="مشهد مزرعة السلطان، اسحب أو كبّر لاستكشاف الأحواض"
        tabIndex={0}
        onKeyDown={(e) => {
          const c = camera.current;
          if (!c) return;
          const directions: Record<string, [number, number]> = {
            ArrowLeft: [60, 0],
            ArrowRight: [-60, 0],
            ArrowUp: [0, 60],
            ArrowDown: [0, -60],
          };
          if (directions[e.key]) {
            e.preventDefault();
            c.panBy(...directions[e.key]);
          } else if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            c.zoomBy(1.2);
          } else if (e.key === '-') {
            e.preventDefault();
            c.zoomBy(0.8);
          } else if (e.key === 'Home') {
            e.preventDefault();
            c.reset();
          }
        }}
      >
        <div ref={world} className={styles.world}>
          {children}
          <svg viewBox="0 0 2048 1143" className={styles.selection} aria-hidden="true">
            {farmBeds.map((points, id) => {
              const p = farmBedPoint(id, 0.12, 0.8),
                ripe =
                  farm.plots[id].plant && farmGrowth(farm.plots[id].plant!, now).stage === 'ripe';
              return (
                <g
                  key={id}
                  data-farm-bed={id}
                  data-selected={id === selected}
                  data-ready={Boolean(ripe)}
                >
                  <polygon points={points.map((p) => p.join(',')).join(' ')} />
                  <circle cx={p.x} cy={p.y} r="17" />
                  <text x={p.x} y={p.y + 6}>
                    {(id + 1).toLocaleString('ar-SA')}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div ref={mount} className={styles.canvas} aria-hidden="true" />
      </div>
      <div className={styles.tools} role="group" aria-label="استكشاف المزرعة">
        <button type="button" onClick={() => camera.current?.reset()}>
          المزرعة كاملة
        </button>
        <button type="button" onClick={() => camera.current?.focusRect(farmBedBounds(selected), 3)}>
          تقريب الحوض {selected + 1}
        </button>
        <button
          type="button"
          aria-label="تكبير المزرعة"
          onClick={() => camera.current?.zoomBy(1.2)}
        >
          +
        </button>
        <button
          type="button"
          aria-label="تصغير المزرعة"
          onClick={() => camera.current?.zoomBy(0.8)}
        >
          −
        </button>
        <button type="button" aria-pressed={quiet} onClick={() => setQuiet(!quiet)}>
          {quiet ? 'تشغيل الحركة' : 'إيقاف الحركة'}
        </button>
      </div>
      <p className={styles.caption}>
        الحوض {selected + 1} ·{' '}
        {current.plant
          ? `${farmCrops[current.plant.crop].name} · ${farmStageNames[growth!.stage]}`
          : 'جاهز لبذرة جديدة'}{' '}
        · اختر الحوض من الصورة أو لوحة الزراعة
      </p>
      {failed && <p role="status">تعذر رسم النباتات؛ تابع حالة النمو والزراعة من اللوحة.</p>}
    </div>
  );
}
