'use client';

import Image from 'next/image';
import {
  ArrowUp,
  Castle,
  Check,
  CircleAlert,
  Coins,
  DoorOpen,
  Flag,
  Hammer,
  Mountain,
  Pickaxe,
  Shield,
  Store,
  Swords,
  Trees,
  Warehouse,
  Wheat,
} from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { buildingKeys } from '@/lib/kingdoms/types';
import { resolveVillageAssetSrc, villageAssetFidelity, villageAssets } from '@/lib/kingdoms/village/assetManifest';
import {
  buildingGroups,
  buildingStatusLabels,
  getBuildingPresentation,
  villageBuildingSceneStatus,
} from '@/lib/kingdoms/village/buildingConfig';
import { createCamera } from '@/lib/kingdoms/village/cameraMath';
import { getBuildingRect, getVillageRect, villageRegions, VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import type {
  VillageCanvasProps,
  VillageSceneHandle,
  VillageSelection,
  WorldRect,
} from '@/lib/kingdoms/village/types';
import { VillageCamera } from './village-camera';
import { bindVillageInput } from './village-input';
import type { VillageRenderer } from './village-renderer';
import styles from './village-canvas.module.css';

const icons = {
  hall: Castle,
  farm: Wheat,
  lumber: Trees,
  quarry: Mountain,
  mine: Pickaxe,
  treasury: Coins,
  warehouse: Warehouse,
  barracks: Swords,
  wall: Shield,
  market: Store,
  embassy: Flag,
};
const statusIcons = {
  upgrade: ArrowUp,
  construction: Hammer,
  shortage: CircleAlert,
  complete: Check,
};
const supplementary = [
  { id: 'tower', name: 'أبراج الحراسة', building: 'wall' },
  { id: 'workshop', name: 'ورش البناء والأخشاب', building: 'lumber' },
] as const;
const rectStyle = (rect: WorldRect): CSSProperties => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
});

function deviceQuality(props: VillageCanvasProps, width: number, height?: number) {
  const device = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return resolveVillageQuality(props.quality, {
    width,
    height,
    memory: device.deviceMemory,
    cores: device.hardwareConcurrency,
    dpr: devicePixelRatio,
    saveData: device.connection?.saveData,
  });
}

export const VillageCanvas = forwardRef<VillageSceneHandle, VillageCanvasProps>(
  function VillageCanvas(props, ref) {
    const stage = useRef<HTMLDivElement>(null);
    const terrain = useRef<HTMLDivElement>(null);
    const world = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const camera = useRef<VillageCamera | null>(null);
    const renderer = useRef<VillageRenderer | null>(null);
    const current = useRef(props);
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [pixiReady, setPixiReady] = useState(false);
    const [retry, setRetry] = useState(0);
    const [measuredStage, setMeasuredStage] = useState({ width: 1, height: 1 });
    const [clock, setClock] = useState({ base: props.view.serverNow, elapsed: 0 });
    const announced = useRef(false);
    const descriptionId = useId();
    const coordinateReadout = useRef<HTMLSpanElement>(null);

    useImperativeHandle(
      ref,
      () => ({
        focusOn: (target, complete) => camera.current?.focusOn(target, complete),
        zoomBy: (factor) => camera.current?.zoomBy(factor),
        reset: () => camera.current?.reset(),
        panBy: (dx, dy) => camera.current?.panBy(dx, dy),
        getSnapshot: () =>
          camera.current?.getSnapshot() ?? createCamera({ width: 768, height: 512 }),
      }),
      [],
    );

    useEffect(() => {
      current.current = props;
      if (camera.current) {
        camera.current.reducedMotion = props.reducedMotion;
        camera.current.debug = props.debug;
      }
      if (coordinateReadout.current && camera.current) {
        const snapshot = camera.current.getSnapshot();
        coordinateReadout.current.textContent = `X ${snapshot.x.toFixed(1)} / Y ${snapshot.y.toFixed(1)} · Zoom ${snapshot.zoom.toFixed(2)}× · World ${VILLAGE_WORLD.width} × ${VILLAGE_WORLD.height}`;
      }
      if (renderer.current && stage.current)
        renderer.current.update(
          props,
          deviceQuality(props, stage.current.clientWidth, stage.current.clientHeight),
        );
    }, [props]);

    useEffect(() => {
      if (!stage.current || !terrain.current || !world.current || !canvas.current) return;
      const element = stage.current;
      const projectedTerrain = terrain.current;
      const projectedWorld = world.current;
      const surface = canvas.current;
      surface.hidden = false;
      const bounds = () => ({
        width: element.clientWidth || 768,
        height: element.clientHeight || 512,
      });
      const controller = new VillageCamera(bounds());
      controller.reducedMotion = current.current.reducedMotion;
      controller.debug = current.current.debug;
      controller.getFocusAnchor = () => {
        if (window.innerWidth > 1000) return undefined;
        const rect = element.getBoundingClientRect();
        const viewport = controller.getSnapshot().viewport;
        const sheetTop = window.innerHeight * 0.62 - 16;
        const visibleTop = Math.min(viewport.height, Math.max(0, -rect.top));
        const visibleBottom = Math.min(viewport.height, Math.max(visibleTop, sheetTop - rect.top));
        return {
          x: viewport.width / 2,
          y: Math.min(viewport.height, Math.max(48, (visibleTop + visibleBottom) / 2)),
        };
      };
      camera.current = controller;
      let active = true;
      let scene: VillageRenderer | null = null;
      const unsubscribe = controller.subscribe((snapshot) => {
        const transform = `translate(${snapshot.viewport.width / 2 - snapshot.x * snapshot.scale}px, ${snapshot.viewport.height / 2 - snapshot.y * snapshot.scale}px) scale(${snapshot.scale})`;
        projectedTerrain.style.transform = transform;
        projectedWorld.style.transform = transform;
        element.style.setProperty('--camera-scale', String(snapshot.scale));
        element.dataset.zoom = snapshot.zoom.toFixed(3);
        element.dataset.cameraX = snapshot.x.toFixed(2);
        element.dataset.cameraY = snapshot.y.toFixed(2);
        if (coordinateReadout.current)
          coordinateReadout.current.textContent = `X ${snapshot.x.toFixed(1)} / Y ${snapshot.y.toFixed(1)} · Zoom ${snapshot.zoom.toFixed(2)}× · World ${VILLAGE_WORLD.width} × ${VILLAGE_WORLD.height}`;
        scene?.camera(snapshot);
      });
      const inputCleanup = bindVillageInput(element, controller);
      const publishStage = () => {
        const next = { width: element.clientWidth || 1, height: element.clientHeight || 1 };
        setMeasuredStage((prev) =>
          prev.width === next.width && prev.height === next.height ? prev : next,
        );
      };
      const resize = () => {
        publishStage();
        controller.resize(bounds());
        if (current.current.selected) {
          if (window.innerWidth <= 1000) {
            const rect = element.getBoundingClientRect();
            const sheetTop = window.innerHeight * 0.62 - 16;
            if (rect.top >= sheetTop - 48 || rect.bottom <= 48) {
              element.scrollIntoView?.({ block: 'start', behavior: 'instant' });
            }
          }
          controller.focusOn(current.current.selected);
        }
        scene?.update(
          current.current,
          deviceQuality(current.current, element.clientWidth, element.clientHeight),
        );
      };
      const observer =
        typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
      publishStage();
      observer?.observe(element);
      window.addEventListener('resize', resize);
      let inViewport = true;
      const syncVisibility = () => scene?.setVisible(!document.hidden && inViewport);
      const visibility =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver(([entry]) => {
              inViewport = entry.isIntersecting;
              syncVisibility();
            });
      visibility?.observe(element);
      document.addEventListener('visibilitychange', syncVisibility);
      const computed = getComputedStyle(element);
      const colors = {
        gold: computed.getPropertyValue('--gold').trim() || 'gold',
        light: computed.getPropertyValue('--foreground').trim() || 'white',
        water: computed.getPropertyValue('--color-text-muted').trim() || 'white',
        dust: computed.getPropertyValue('--gold').trim() || 'gold',
      };
      void import('./village-renderer')
        .then(async ({ createVillageRenderer }) => {
          if (!active) return;
          const next = await createVillageRenderer(
            surface,
            current.current,
            deviceQuality(current.current, element.clientWidth, element.clientHeight),
            colors,
          );
          if (!active) {
            next.destroy();
            return;
          }
          scene = next;
          renderer.current = next;
          scene.update(
            current.current,
            deviceQuality(current.current, element.clientWidth, element.clientHeight),
          );
          scene.camera(controller.getSnapshot());
          syncVisibility();
          setPixiReady(true);
        })
        .catch(() => {
          if (active) {
            surface.hidden = true;
            setPixiReady(false);
          }
        });
      return () => {
        active = false;
        unsubscribe();
        inputCleanup();
        controller.destroy();
        scene?.destroy();
        observer?.disconnect();
        visibility?.disconnect();
        document.removeEventListener('visibilitychange', syncVisibility);
        window.removeEventListener('resize', resize);
        renderer.current = null;
        camera.current = null;
      };
    }, [retry]);

    useEffect(() => {
      if (props.selected) camera.current?.focusOn(props.selected);
    }, [props.selected]);

    useEffect(() => {
      if (!loaded || announced.current) return;
      announced.current = true;
      current.current.onReady?.();
    }, [loaded]);

    useEffect(() => {
      if (!props.village.build) return;
      const anchor = performance.now();
      const timer = setInterval(
        () =>
          setClock({
            base: props.view.serverNow,
            elapsed: Math.max(0, performance.now() - anchor),
          }),
        1000,
      );
      return () => clearInterval(timer);
    }, [props.village.build, props.view.serverNow]);

    const choose = (building: VillageSelection) => {
      if (camera.current) camera.current.focusOn(building, () => current.current.onSelect(building));
      else current.current.onSelect(building);
    };
    const build = props.village.build;
    const now = props.view.serverNow + (clock.base === props.view.serverNow ? clock.elapsed : 0);
    const remaining = build ? Math.max(0, Math.ceil((build.endsAt - now) / 1000)) : 0;
    const progress =
      build?.startedAt !== undefined && build.endsAt > build.startedAt
        ? Math.min(
            100,
            Math.max(0, ((now - build.startedAt) / (build.endsAt - build.startedAt)) * 100),
          )
        : undefined;
    const terrainFidelity = villageAssetFidelity(
      deviceQuality(props, measuredStage.width, measuredStage.height).mode,
    );
    const terrainSrc =
      resolveVillageAssetSrc(villageAssets.base, terrainFidelity) ?? villageAssets.base.src;

    return (
      <div
        ref={stage}
        className={styles.stage}
        tabIndex={0}
        role="region"
        aria-label="مشهد القرية التفاعلي، اسحب للتحريك وكبّر بعجلة الفأرة أو بإصبعين"
        aria-busy={!loaded && !failed}
        data-village-scene
        data-pixi-ready={pixiReady}
        data-zoom="1"
        data-labels={props.showLabels}
        data-threat-severity={props.threatSeverity}
        data-visual-tier={props.village.progression?.visualTier}
        data-debug-hitboxes={process.env.NODE_ENV === 'development' && props.debug?.hitboxes}
        data-terrain-fidelity={terrainFidelity}
        data-terrain-src={terrainSrc}
      >
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div
          ref={terrain}
          className={styles.terrain}
          style={{ width: VILLAGE_WORLD.width, height: VILLAGE_WORLD.height }}
        >
          <Image
            key={`${retry}:${terrainSrc}`}
            src={terrainSrc}
            alt=""
            fill
            sizes="(min-width: 2560px) 1920px, (max-width: 700px) 100vw, 1200px"
            draggable={false}
            priority
            unoptimized
            className={styles.artwork}
            onLoad={() => {
              setFailed(false);
              setLoaded(true);
            }}
            onError={() => setFailed(true)}
          />
        </div>
        <div
          ref={world}
          className={styles.world}
          style={{ width: VILLAGE_WORLD.width, height: VILLAGE_WORLD.height }}
        >
          <div className={styles.hotspots}>
            {buildingKeys.map((building) => {
              const presentation = getBuildingPresentation(
                building,
                props.village,
                props.view.config,
              );
              const Icon = icons[building];
              const StatusIcon = statusIcons[presentation.status];
              const sceneStatus = villageBuildingSceneStatus(building, props.village);
              const state =
                presentation.status === 'construction'
                  ? 'قيد التطوير'
                  : presentation.level > 0
                    ? `المستوى ${presentation.level.toLocaleString('ar-SA')}`
                    : sceneStatus;
              return (
                <button
                  type="button"
                  key={building}
                  className={styles.hotspot}
                  style={rectStyle(getBuildingRect(building, props.debug))}
                    aria-label={
                      state === sceneStatus
                        ? `${presentation.name}، ${state}`
                        : `${presentation.name}، ${state}، ${sceneStatus}`
                    }
                  aria-describedby={`${descriptionId}-${building}`}
                  aria-pressed={props.selected === building}
                  data-building={building}
                  data-state={presentation.status}
                  data-group={buildingGroups[building]}
                  onClick={() => choose(building)}
                  onPointerEnter={() => renderer.current?.hover(building)}
                  onPointerLeave={() => renderer.current?.hover(null)}
                  onFocus={() => renderer.current?.hover(building)}
                  onBlur={() => renderer.current?.hover(null)}
                >
                  <span id={`${descriptionId}-${building}`} className={styles.visuallyHidden}>
                    {presentation.description}، {buildingStatusLabels[presentation.status]}
                  </span>
                  <span className={styles.label}>
                    <Icon size={15} aria-hidden="true" />
                    <span>
                      {presentation.name}
                      <small>
                        {state} · {sceneStatus}
                      </small>
                    </span>
                    <StatusIcon size={13} aria-hidden="true" />
                  </span>
                  <span className={styles.marker} title={buildingStatusLabels[presentation.status]}>
                    <StatusIcon size={12} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className={`${styles.hotspot} ${styles.region}`}
              style={rectStyle(getVillageRect('stable', props.debug))}
              aria-label={`الإسطبل، المستوى ${props.village.buildings.barracks.toLocaleString('ar-SA')}، ${villageBuildingSceneStatus('stable', props.village)}`}
              aria-describedby={`${descriptionId}-stable`}
              aria-pressed={props.selected === 'stable'}
              data-building-region="stable"
              data-state={getBuildingPresentation('barracks', props.village, props.view.config).status}
              onClick={() => choose('stable')}
              onPointerEnter={() => renderer.current?.hover('stable')}
              onPointerLeave={() => renderer.current?.hover(null)}
              onFocus={() => renderer.current?.hover('stable')}
              onBlur={() => renderer.current?.hover(null)}
            >
              <span id={`${descriptionId}-stable`} className={styles.visuallyHidden}>
                ملحق الفرسان التابع للثكنة؛ المستوى والتطوير والتدريب مرتبطون بالثكنة.
              </span>
              <span className={styles.label}>
                <Swords size={15} aria-hidden="true" />
                <span>الإسطبل<small>المستوى {props.village.buildings.barracks.toLocaleString('ar-SA')} · {villageBuildingSceneStatus('stable', props.village)}</small></span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.hotspot} ${styles.region} ${styles.rally}`}
              style={rectStyle(getVillageRect('rally', props.debug))}
              aria-label="نقطة تجمع الجيوش، مركز القيادة العسكرية"
              aria-pressed={props.selected === 'rally'}
              data-building-region="rally"
              data-rally-point="true"
              onClick={() => choose('rally')}
              onPointerEnter={() => renderer.current?.hover('rally')}
              onPointerLeave={() => renderer.current?.hover(null)}
              onFocus={() => renderer.current?.hover('rally')}
              onBlur={() => renderer.current?.hover(null)}
            >
              <span className={styles.label}>
                <Flag size={15} aria-hidden="true" />
                <span>
                  نقطة تجمع الجيوش
                  <small>القيادة العسكرية</small>
                </span>
              </span>
            </button>
            {supplementary.map((region) => (
              <button
                type="button"
                key={region.id}
                className={`${styles.hotspot} ${styles.region}`}
                style={rectStyle(villageRegions[region.id])}
                aria-label={region.name}
                data-building-region={region.id}
                onClick={() => choose(region.building)}
              >
                <span className={styles.label}>{region.name}</span>
              </button>
            ))}
            <button
              type="button"
              className={`${styles.hotspot} ${styles.region}`}
              style={rectStyle(villageRegions.gate)}
              aria-label="البوابة الرئيسية، خريطة العالم"
              data-building-region="gate"
              data-threat={props.showThreatMarker || undefined}
              onClick={() => camera.current?.focusOn('gate', () => current.current.onWorldMap?.())}
            >
              <span className={styles.label}>
                <DoorOpen size={15} aria-hidden="true" />
                خريطة العالم
                {props.showThreatMarker && (
                  <Swords size={15} aria-label="مؤشر تهديد عسكري عند البوابة" />
                )}
              </span>
            </button>
            {build && (
              <div
                className={styles.construction}
                style={{
                  left:
                    getBuildingRect(build.building, props.debug).x +
                    getBuildingRect(build.building, props.debug).width / 2,
                  top:
                    getBuildingRect(build.building, props.debug).y +
                    getBuildingRect(build.building, props.debug).height,
                }}
              >
                <Hammer size={14} aria-hidden="true" />
                <span>
                  {remaining ? 'قيد البناء' : 'بانتظار تأكيد الاكتمال'}
                  <small>{props.view.config.buildings[build.building].name}</small>
                </span>
                {progress !== undefined && (
                  <span
                    role="progressbar"
                    aria-label={`تقدم بناء ${props.view.config.buildings[build.building].name}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.floor(progress)}
                    className={styles.progress}
                  >
                    <i style={{ width: `${progress}%` }} />
                  </span>
                )}
                {remaining > 0 && (
                  <bdi>{`${Math.floor(remaining / 3600)
                    .toString()
                    .padStart(2, '0')}:${Math.floor((remaining % 3600) / 60)
                    .toString()
                    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`}</bdi>
                )}
              </div>
            )}
          </div>
        </div>
        {!loaded && !failed && (
          <span className={styles.loading} role="status">
            تجهيز القرية…
          </span>
        )}
        {failed && (
          <div className={styles.error} role="alert">
            تعذر تحميل صورة القرية.
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                setLoaded(false);
                setRetry((value) => value + 1);
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        )}
        {process.env.NODE_ENV === 'development' && props.debug?.coordinates && (
          <span ref={coordinateReadout} className={styles.coordinates} aria-hidden="true">
            World: {VILLAGE_WORLD.width} × {VILLAGE_WORLD.height}
          </span>
        )}
      </div>
    );
  },
);
