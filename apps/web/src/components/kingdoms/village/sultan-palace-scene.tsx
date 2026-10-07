'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GardenPlacement } from '@/lib/kingdoms/palace-garden';
import { PALACE_WORLD, palaceSlotBounds, palaceZoomPresets, type PalacePreset } from '@/lib/kingdoms/village/palace-scene-layout';
import { unprojectPoint } from '@/lib/kingdoms/village/cameraMath';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { createPalaceQualityMonitor } from '@/lib/kingdoms/village/palace-quality';
import type { CameraSnapshot, VillageQuality } from '@/lib/kingdoms/village/types';
import { VillageCamera } from './village-camera';
import { PalaceSceneContext } from './palace-scene-context';
import type { createSultanPalaceRenderer } from './sultan-palace-renderer';
import styles from './sultan-palace-scene.module.css';

const labels: Record<PalacePreset, string> = { FULLPALACE: 'القصر كاملًا', ENTRANCE: 'المدخل', GARDEN: 'الحديقة', FOUNTAIN: 'النافورة', GARDENSLOT: 'الحوض المحدد' };
export function SultanPalaceScene({ children, garden }: { children: ReactNode; garden?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null), canvasMount = useRef<HTMLDivElement>(null);
  const camera = useRef<VillageCamera | null>(null);
  const renderer = useRef<Awaited<ReturnType<typeof createSultanPalaceRenderer>> | null>(null);
  const placements = useRef<readonly GardenPlacement[]>([]);
  const retainedCamera = useRef<CameraSnapshot | null>(null), retainedTime = useRef(0);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [quality, setQuality] = useState<VillageQuality>('auto'), [paused, setPaused] = useState(false);
  const [autoLimit, setAutoLimit] = useState<VillageQuality>('auto');
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [preset, setPreset] = useState<PalacePreset | 'EXPLORE'>('FULLPALACE');
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const selections = useRef(new Set<(id: number) => void>());
  const chooseSlot = useCallback((id: number) => { setSelectedSlot(id); selections.current.forEach(listener => listener(id)); }, []);
  const registerSelection = useCallback((listener: (id: number) => void) => {
    selections.current.add(listener); return () => { selections.current.delete(listener); };
  }, []);
  const clearSelection = useCallback(() => setSelectedSlot(null), []);
  const focus = useCallback((preset: PalacePreset, slot = selectedSlot) => {
    setPreset(preset);
    const instance = camera.current; if (!instance) return;
    if (preset === 'FULLPALACE') { instance.reset(); return; }
    const rect = preset === 'GARDENSLOT' && slot !== null ? palaceSlotBounds(slot) : palaceZoomPresets[preset as keyof typeof palaceZoomPresets];
    if (!rect) return;
    const zoom = preset === 'GARDEN' ? 1.65 : 3;
    instance.focusRect(rect, zoom);
  }, [selectedSlot]);
  const focusSlot = useCallback((id: number) => { chooseSlot(id); focus('GARDENSLOT', id); }, [chooseSlot, focus]);
  const setGarden = useCallback((items: readonly GardenPlacement[]) => {
    placements.current = items;
    void renderer.current?.updateGarden(items).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const element = host.current, mount = canvasMount.current; if (!element || !mount) return;
    // Pixi destroys its WebGL context. Each effect owns a fresh canvas rather
    // than trying to initialize a second renderer on a lost context.
    const surface = document.createElement('canvas'); surface.className = styles.canvas;
    surface.setAttribute('aria-hidden', 'true'); mount.appendChild(surface);
    let disposed = false, qualityTimer: ReturnType<typeof setInterval> | undefined;
    const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
    const instance = new VillageCamera({ width, height }, false, PALACE_WORLD); camera.current = instance;
    if (retainedCamera.current) instance.restore(retainedCamera.current);
    const unsubscribe = instance.subscribe(snapshot => {
      const x = snapshot.viewport.width / 2 - snapshot.x * snapshot.scale, y = snapshot.viewport.height / 2 - snapshot.y * snapshot.scale;
      element.style.setProperty('--palace-camera-transform', `matrix(${snapshot.scale},0,0,${snapshot.scale},${x},${y})`);
    });
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
    const settings = resolveVillageQuality(quality === 'auto' ? autoLimit : quality, { width, height,
      dpr: window.devicePixelRatio, cores: device.hardwareConcurrency, memory: device.deviceMemory, saveData: device.connection?.saveData });
    const updateMotion = () => { instance.reducedMotion = motion.matches; renderer.current?.setMotion(!motion.matches && !pausedRef.current); };
    motion.addEventListener('change', updateMotion); updateMotion();
    setReady(false); setFailed(false);
    const updateSize = () => renderer.current?.resize(Math.max(1, element.clientWidth), Math.max(1, element.clientHeight));
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    if (resize) resize.observe(element); else window.addEventListener('resize', updateSize);
    void import('./sultan-palace-renderer').then(module => module.createSultanPalaceRenderer(surface, element, instance, settings, retainedTime.current)).then(async runtime => {
      if (disposed) { runtime.destroy(); return; }
      renderer.current = runtime; runtime.resize(Math.max(1, element.clientWidth), Math.max(1, element.clientHeight)); updateMotion(); await runtime.updateGarden(placements.current);
      if (!disposed) { setReady(true); surface.dataset.palaceQuality = settings.mode; surface.dataset.palaceTargetFps = String(settings.fps); }
      if (!disposed && quality === 'auto') {
        const monitor = createPalaceQualityMonitor(settings.mode);
        let previous = runtime.getFrameStats();
        qualityTimer = setInterval(() => {
          if (disposed) return;
          const current = runtime.getFrameStats();
          const fallback = monitor.sample(current.frames - previous.frames, current.at - previous.at, current.activeMs - previous.activeMs);
          previous = current;
          if (fallback) { clearInterval(qualityTimer); setAutoLimit(fallback); }
        }, 3500);
      }
    }).catch(() => { if (!disposed) setFailed(true); });
    const points = new Map<number, { x: number; y: number }>();
    let origin: { x: number; y: number } | null = null, dragged = false;
    const local = (event: PointerEvent | WheelEvent) => { const rect = element.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    const distance = () => { const [a, b] = [...points.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
    const down = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('button,select,[data-testid="palace-garden"]')) return;
      if (event.button !== 0 || points.size >= 2) return;
      points.set(event.pointerId, local(event)); origin = local(event); dragged = points.size > 1;
      element.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const previous = points.get(event.pointerId); if (!previous) return;
      const next = local(event), before = distance(); points.set(event.pointerId, next);
      if (origin && Math.hypot(next.x - origin.x, next.y - origin.y) > 5) dragged = true;
      if (points.size === 2) {
        setPreset('EXPLORE');
        const [a, b] = [...points.values()]; const after = distance();
        if (before > 0 && after > 0) instance.zoomAt(after / before, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      } else if (dragged) { setPreset('EXPLORE'); instance.panBy(next.x - previous.x, next.y - previous.y); }
    };
    const up = (event: PointerEvent) => {
      const point = points.get(event.pointerId); if (!point) return; points.delete(event.pointerId);
      if (event.type === 'pointerup' && !dragged && point) {
        const world = unprojectPoint(point, instance.getSnapshot());
        for (let id = 0; id < 12; id++) { const rect = palaceSlotBounds(id);
          if (world.x >= rect.x && world.x <= rect.x + rect.width && world.y >= rect.y && world.y <= rect.y + rect.height) { chooseSlot(id); break; }
        }
      }
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (!points.size) origin = null;
    };
    const wheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest('button,select,[data-testid="palace-garden"]')) return;
      event.preventDefault(); setPreset('EXPLORE'); instance.zoomAt(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .002), local(event));
    };
    element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up); element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      disposed = true; retainedCamera.current = instance.getSnapshot(); retainedTime.current = renderer.current?.getElapsed() ?? retainedTime.current;
      clearInterval(qualityTimer);
      resize?.disconnect(); window.removeEventListener('resize', updateSize);
      motion.removeEventListener('change', updateMotion); unsubscribe(); instance.destroy(); camera.current = null;
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); element.removeEventListener('wheel', wheel);
      renderer.current?.destroy(); renderer.current = null; surface.remove(); element.style.removeProperty('--palace-camera-transform'); points.clear();
    };
  }, [quality, autoLimit, chooseSlot]);
  useEffect(() => { renderer.current?.setMotion(!paused && !window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, [paused]);
  const context = useMemo(() => ({ ready, selectedSlot, setGarden, focusSlot, selectSlot: chooseSlot, registerSelection, clearSelection }), [ready, selectedSlot, setGarden, focusSlot, chooseSlot, registerSelection, clearSelection]);
  return <PalaceSceneContext.Provider value={context}><div ref={host} className={styles.frame} data-sultan-palace="" data-pixi-garden={ready}>
    <div className={styles.viewport} role="application" aria-label="مشهد قصر السلطان؛ اسحب أو قرّب لاستكشافه" tabIndex={0} onKeyDown={event => {
      const instance = camera.current; if (!instance) return;
      const directions: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] };
      if (directions[event.key]) { event.preventDefault(); setPreset('EXPLORE'); instance.panBy(...directions[event.key]); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); setPreset('EXPLORE'); instance.zoomBy(1.2); }
      else if (event.key === '-') { event.preventDefault(); setPreset('EXPLORE'); instance.zoomBy(.8); }
      else if (event.key === 'Home') { event.preventDefault(); setPreset('FULLPALACE'); instance.reset(); }
    }}><div className={styles.world}>{children}</div><div ref={canvasMount} className={styles.canvas} aria-hidden="true" /></div>
    {garden}
    <div className={styles.tools} role="group" aria-label="كاميرا وجودة القصر">
      <select aria-label="وجهة كاميرا القصر" value={preset} onChange={event => focus(event.target.value as PalacePreset)}>
        <option value="EXPLORE" disabled>استكشاف حر</option>
        {(Object.keys(labels) as PalacePreset[]).map(preset => <option key={preset} value={preset} disabled={preset === 'GARDENSLOT' && selectedSlot === null}>{labels[preset]}</option>)}
      </select>
      <button type="button" aria-label="تكبير القصر" onClick={() => camera.current?.zoomBy(1.2)}>+</button>
      <button type="button" aria-label="تصغير القصر" onClick={() => camera.current?.zoomBy(.8)}>−</button>
      <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'تشغيل الحركة' : 'إيقاف الحركة'}</button>
      <select aria-label="جودة القصر" value={quality} onChange={event => { setAutoLimit('auto'); setQuality(event.target.value as VillageQuality); }}>
        <option value="auto">تلقائي</option><option value="high">عالية</option><option value="medium">متوسطة</option><option value="low">خفيفة</option>
      </select>
    </div>
    {failed && <p className={styles.status} role="status">تعذّر تشغيل بعض الطبقات؛ صورة القصر والتخصيص متاحان.</p>}
  </div></PalaceSceneContext.Provider>;
}
