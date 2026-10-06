'use client';

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
import { formatCountdown, remainingMs } from '@/lib/kingdoms/incoming-threats';
import { presentRallyCommand } from '@/lib/kingdoms/rally-command';
import { useViewClock } from '../use-view-clock';
import { buildingKeys } from '@/lib/kingdoms/types';
import { resourceBuildingIds, resolveVillageAssetSrc, villageAssetFidelity, villageAssets, villageArtRenditions } from '@/lib/kingdoms/village/assetManifest';
import { getVillageLabelDensity, villageLabelPoint, visibleVillageLabels, type VillageLabelDensity } from '@/lib/kingdoms/village/labelLayout';
import {
  buildingGroups,
  buildingStatusLabels,
  getBuildingPresentation,
  villageBuildingSceneStatus,
} from '@/lib/kingdoms/village/buildingConfig';
import { getVillageVisualLevel } from '@/lib/kingdoms/village/buildingRegistry';
import { createCamera, projectPoint } from '@/lib/kingdoms/village/cameraMath';
import { getBuildingRect, getVillageRect, villageRegions, VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { visibleMapAnchor } from '@/lib/kingdoms/village/visibleMapRect';
import type {
  VillageCanvasProps,
  VillageSceneHandle,
  VillageSelection,
  CameraSnapshot,
  WorldRect,
} from '@/lib/kingdoms/village/types';
import { VillageCamera } from './village-camera';
import { bindVillageInput } from './village-input';
import type { VillageRenderer } from './village-renderer';
import styles from './village-canvas.module.css';
import { CityHubCanvas } from './city-hub-canvas';

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
] as const;
const rectStyle = (rect: WorldRect): CSSProperties => ({
  left: rect.x,
  top: rect.y,
  width: rect.width,
  height: rect.height,
  marginLeft: `min(0px, calc((${rect.width}px - 44px / var(--camera-scale)) / 2))`,
  marginTop: `min(0px, calc((${rect.height}px - 44px / var(--camera-scale)) / 2))`,
});

function ConstructionMarker({
  props,
}: {
  props: VillageCanvasProps;
}) {
  const build = props.village.build;
  const now = useViewClock(
    props.view,
    build?.endsAt ?? props.view.serverNow,
    `village-build:${props.village.id}:${build?.building ?? ''}:${build?.endsAt ?? 0}`,
  );
  if (!build) return null;
  const remaining = Math.max(0, Math.ceil((build.endsAt - now) / 1000));
  const progress =
    build.startedAt !== undefined && build.endsAt > build.startedAt
      ? Math.min(100, Math.max(0, ((now - build.startedAt) / (build.endsAt - build.startedAt)) * 100))
      : undefined;
  const rect = getBuildingRect(build.building, props.debug);
  const name = props.view.config.buildings[build.building].name;
  return (
    <div
      className={styles.construction}
      data-construction-asset={villageAssets.environment.scaffold.src ? 'dedicated' : 'MISSING_ASSET'}
      style={{ left: rect.x + rect.width / 2, top: rect.y }}
    >
      <Hammer size={14} aria-hidden="true" />
      <span>
        {remaining ? 'قيد البناء' : 'بانتظار تأكيد الاكتمال'}
        <small>{name}</small>
      </span>
      {progress !== undefined && (
        <span
          role="progressbar"
          aria-label={`تقدم بناء ${name}`}
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
  );
}

function RallyPointBadge({ props }: { props: VillageCanvasProps }) {
  const command = presentRallyCommand(props.view, props.village);
  const threat = command.nearestThreat;
  const now = useViewClock(
    props.view,
    threat?.arrivesAt ?? props.view.serverNow,
    `rally-badge:${props.village.id}`,
  );
  const movements = command.outgoing.length + command.returning.length;
  if (!movements && !command.attacks.length) return null;
  const countdown = threat ? formatCountdown(remainingMs(threat.arrivesAt, now)) : '';
  return (
    <span className={styles.rallyBadge} data-severity={threat?.severity}>
      {threat ? `⚔ ${countdown}` : movements}
    </span>
  );
}

function deviceQuality(props: VillageCanvasProps, width: number, height?: number) {
  const device = (typeof navigator === 'undefined' ? {} : navigator) as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return resolveVillageQuality(props.quality, {
    width,
    height,
    memory: device.deviceMemory,
    cores: device.hardwareConcurrency,
    dpr: typeof devicePixelRatio === 'undefined' ? 1 : devicePixelRatio,
    saveData: device.connection?.saveData,
  });
}

const ProductionVillageCanvas = forwardRef<VillageSceneHandle, VillageCanvasProps>(
  function ProductionVillageCanvas(props, ref) {
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
    const [terrainViewport, setTerrainViewport] = useState({ width: 768, height: 512 });
    const announced = useRef(false);
    const descriptionId = useId();
    const coordinateReadout = useRef<HTMLSpanElement>(null);
    const resizeScene = useRef<(() => void) | null>(null);
    const labelDensity = useRef<VillageLabelDensity | undefined>(undefined);
    const syncLabels = (snapshot: CameraSnapshot, active: string | null = current.current.selected) => {
      const anchors = [...buildingKeys, 'rally', 'tower', 'gate'] .map((id) => {
        const rect = getVillageRect(id as Parameters<typeof getVillageRect>[0], current.current.debug);
        return { id, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 - Math.max(rect.height, 44 / snapshot.scale) * .3 };
      });
      const viewportRect = stage.current?.getBoundingClientRect();
      const scene = stage.current?.parentElement;
      const hud = scene?.closest('[data-village-stage="live"]')?.querySelector('[aria-label="موارد القرية"]')?.parentElement;
      const topInset = viewportRect && hud ? Math.max(0, hud.getBoundingClientRect().bottom - viewportRect.top) : 0;
      const overlays = [
        ...(hud ? [hud] : []),
        ...Array.from(scene?.querySelectorAll<HTMLElement>('header, [aria-label="كاميرا القرية"], [aria-label="مستويات عرض المملكة"], details') ?? []),
        ...Array.from(scene?.closest('[data-selected]')?.querySelectorAll<HTMLElement>(':scope > details, aside, nav') ?? []),
      ];
      const blockedAreas = viewportRect ? overlays.map((overlay) => {
        const rect = overlay.getBoundingClientRect();
        return { x: rect.left - viewportRect.left, y: rect.top - viewportRect.top, width: rect.width, height: rect.height };
      }).filter(({ width, height }) => width > 0 && height > 0) : [];
      labelDensity.current = getVillageLabelDensity(snapshot.zoom, labelDensity.current);
      const visible = new Set(visibleVillageLabels(anchors, snapshot, active, blockedAreas, topInset, labelDensity.current));
      world.current?.querySelectorAll<HTMLElement>('[data-label-id]').forEach((element) => {
        element.dataset.labelHidden = String(!visible.has(element.dataset.labelId!));
        const anchor = anchors.find(({ id }) => id === element.dataset.labelId);
        if (!anchor) return;
        const original = projectPoint(anchor, snapshot);
        const positioned = villageLabelPoint(anchor, snapshot, active, topInset);
        element.style.setProperty('--label-shift-x', `${(positioned.x - original.x) / snapshot.scale}px`);
        element.style.setProperty('--label-shift-y', `${(positioned.y - original.y) / snapshot.scale}px`);
      });
    };
    const highlight = (building: VillageSelection | null) => {
      renderer.current?.hover(building);
      if (camera.current) syncLabels(camera.current.getSnapshot(), building ?? current.current.selected);
    };

    useImperativeHandle(
      ref,
      () => ({
        focusOn: (target, complete) => camera.current?.focusOn(target, complete),
        zoomBy: (factor) => camera.current?.zoomBy(factor),
        zoomTo: (zoom, complete) => camera.current?.zoomTo(zoom, complete),
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
        syncLabels(camera.current.getSnapshot());
      }
      if (coordinateReadout.current && camera.current) {
        const snapshot = camera.current.getSnapshot();
        coordinateReadout.current.textContent = `X ${snapshot.x.toFixed(1)} / Y ${snapshot.y.toFixed(1)} · Zoom ${snapshot.zoom.toFixed(2)}× · World ${VILLAGE_WORLD.width} × ${VILLAGE_WORLD.height}`;
      }
      if (renderer.current && stage.current)
        renderer.current.update(props, deviceQuality(props, stage.current.clientWidth, stage.current.clientHeight));
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
      const initialBounds = bounds();
      const controller = new VillageCamera(initialBounds, () => typeof window !== 'undefined' && window.innerWidth <= 700);
      controller.reducedMotion = current.current.reducedMotion;
      controller.debug = current.current.debug;
      controller.getFocusAnchor = () => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return undefined;
        const layout = element.closest('[data-selected]');
        const shell = element.closest('[data-village-stage="live"]');
        const hud = shell?.querySelector('[aria-label="موارد القرية"]')?.parentElement;
        const overlays = [
          ...(hud ? [hud] : []),
          ...Array.from(layout?.querySelectorAll<HTMLElement>(
            'aside, nav, header, details, [aria-label="كاميرا القرية"], [aria-label="مستويات عرض المملكة"]',
          ) ?? []),
          ...Array.from(shell?.querySelectorAll<HTMLElement>('[aria-label="تنقل المملكة"]') ?? []),
        ].map((overlay) => overlay.getBoundingClientRect()).filter(({ width, height }) => width > 0 && height > 0);
        return visibleMapAnchor(
          { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight },
          overlays.map((overlay) => ({ x: overlay.left, y: overlay.top, width: overlay.width, height: overlay.height })),
        );
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
        syncLabels(snapshot);
        if (coordinateReadout.current)
          coordinateReadout.current.textContent = `X ${snapshot.x.toFixed(1)} / Y ${snapshot.y.toFixed(1)} · Zoom ${snapshot.zoom.toFixed(2)}× · World ${VILLAGE_WORLD.width} × ${VILLAGE_WORLD.height}`;
        scene?.camera(snapshot);
      });
      const inputCleanup = bindVillageInput(element, controller);
      const resize = () => {
        if (window.innerWidth <= 1000 && current.current.selected) {
          const rect = element.getBoundingClientRect();
          const sheet = element.closest('[data-selected]')?.querySelector('aside');
          const sheetTop = sheet?.getBoundingClientRect().top ?? window.innerHeight * .56 - 82;
          if (rect.top >= sheetTop - 80 || rect.bottom <= 48) {
            element.scrollIntoView?.({ block: 'start', behavior: 'instant' });
          }
          element.style.setProperty('--focused-stage-height', `${Math.max(160, sheetTop - element.getBoundingClientRect().top - 12)}px`);
        }
        const nextBounds = bounds();
        setTerrainViewport((previous) => previous.width === nextBounds.width && previous.height === nextBounds.height ? previous : nextBounds);
        const pendingSelection = controller.resize(nextBounds);
        // Keep a newly clicked hotspot's completion ahead of the previously open panel.
        if (current.current.selected && !pendingSelection) {
          if (window.innerWidth <= 1000) {
            const rect = element.getBoundingClientRect();
            const sheet = element.closest('[data-selected]')?.querySelector('aside');
            const sheetTop = sheet?.getBoundingClientRect().top ?? window.innerHeight * .56 - 82;
            if (rect.top >= sheetTop - 48 || rect.bottom <= 48) {
              element.scrollIntoView?.({ block: 'start', behavior: 'instant' });
            }
          }
          controller.focusOn(current.current.selected);
        }
        scene?.update(current.current, deviceQuality(current.current, element.clientWidth, element.clientHeight));
      };
      resizeScene.current = resize;
      // Renderer/layout writes must run after observer delivery, not inside its loop.
      let resizeFrame = 0;
      const scheduleResize = () => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = 0;
          if (active) resize();
        });
      };
      const observer =
        typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleResize);
      observer?.observe(element);
      scheduleResize();
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
          scene.update(current.current, deviceQuality(current.current, element.clientWidth, element.clientHeight));
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
        cancelAnimationFrame(resizeFrame);
        visibility?.disconnect();
        document.removeEventListener('visibilitychange', syncVisibility);
        window.removeEventListener('resize', resize);
        renderer.current = null;
        camera.current = null;
        resizeScene.current = null;
      };
    }, [retry]);

    useEffect(() => {
      resizeScene.current?.();
      const sheet = stage.current?.closest('[data-selected]')?.querySelector('aside');
      if (!sheet || typeof ResizeObserver === 'undefined') return;
      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => resizeScene.current?.());
      });
      observer.observe(sheet);
      return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    }, [props.selected]);

    useEffect(() => {
      if (!loaded || announced.current) return;
      announced.current = true;
      current.current.onReady?.();
    }, [loaded]);

    const choose = (building: VillageSelection) =>
      camera.current?.focusOn(building, () => current.current.onSelect(building));

    const terrainFidelity = villageAssetFidelity(deviceQuality(props, terrainViewport.width, terrainViewport.height).mode);
    const terrainSrc = resolveVillageAssetSrc(villageAssets.base, terrainFidelity) ?? villageAssets.base.src;
    const textureWidth = terrainFidelity === 'ultra' ? 1672 : terrainFidelity === 'hidpi' ? 1280 : 960;
    const renditions = villageArtRenditions.filter(({ width }) => width <= textureWidth);
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
        data-focused={props.selected !== null}
        data-terrain-fidelity={terrainFidelity}
        data-terrain-src={terrainSrc}
        data-debug-hitboxes={process.env.NODE_ENV === 'development' && props.debug?.hitboxes}
      >
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div
          ref={terrain}
          className={styles.terrain}
          style={{ width: VILLAGE_WORLD.width, height: VILLAGE_WORLD.height }}
        >
          <picture>
            <source type="image/avif" srcSet={renditions.map((art) => `${art.avif} ${art.width}w`).join(', ')} sizes={`${textureWidth}px`} />
            <source type="image/webp" srcSet={renditions.map((art) => `${art.webp} ${art.width}w`).join(', ')} sizes={`${textureWidth}px`} />
          {/* Native picture chooses pre-encoded renditions and remains available without WebGL. */}
          <img
            key={retry}
            src={terrainSrc}
            alt=""
            width={VILLAGE_WORLD.width}
            height={VILLAGE_WORLD.height}
            draggable={false}
            fetchPriority="high"
            className={styles.artwork}
            onLoad={() => {
              setFailed(false);
              setLoaded(true);
            }}
            onError={() => setFailed(true)}
          />
          </picture>
        </div>
        <div
          ref={world}
          className={styles.world}
          style={{ width: VILLAGE_WORLD.width, height: VILLAGE_WORLD.height }}
        >
          {!pixiReady && resourceBuildingIds.map((id) => {
            const level = getVillageVisualLevel(id, props.village, props.debug);
            if (level <= 0) return null;
            const slot = villageAssets.buildings[id][level - 1];
            const src = resolveVillageAssetSrc(slot, terrainFidelity);
            if (!src) return null;
            const rect = getVillageRect(id, props.debug);
            return <picture key={id}><img data-resource-art={id} src={src} alt="" aria-hidden="true"
              className={styles.resourceArtwork} draggable={false}
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} /></picture>;
          })}
          <div className={styles.hotspots}>
            {buildingKeys.filter((building) => building !== 'stable').map((building) => {
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
                  aria-label={`${presentation.name}، ${state}`}
                  aria-describedby={`${descriptionId}-${building}`}
                  aria-pressed={props.selected === building}
                  data-building={building}
                  data-label-id={building}
                  data-state={presentation.status}
                  data-group={buildingGroups[building]}
                  onClick={() => choose(building)}
                  onPointerEnter={() => highlight(building)}
                  onPointerLeave={() => highlight(null)}
                  onFocus={() => highlight(building)}
                  onBlur={() => highlight(null)}
                >
                  <span id={`${descriptionId}-${building}`} className={styles.visuallyHidden}>
                    {presentation.description}، {buildingStatusLabels[presentation.status]}، {sceneStatus}
                  </span>
                  <span className={styles.label}>
                    <Icon size={15} aria-hidden="true" />
                    <span>
                      {presentation.name}
                      <small>
                        <bdi dir="ltr">Lv.{presentation.level}</bdi>
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
              aria-label={`الإسطبل، المستوى ${props.village.buildings.stable.toLocaleString('ar-SA')}`}
              aria-describedby={`${descriptionId}-stable`}
              aria-pressed={props.selected === 'stable'}
              data-building-region="stable"
              data-label-id="stable"
              data-state={getBuildingPresentation('stable', props.village, props.view.config).status}
              onClick={() => choose('stable')}
              onPointerEnter={() => highlight('stable')}
              onPointerLeave={() => highlight(null)}
              onFocus={() => highlight('stable')}
              onBlur={() => highlight(null)}
            >
              <span id={`${descriptionId}-stable`} className={styles.visuallyHidden}>
                الإسطبل مبنى مستقل. مستواه يحدد تدريب الفرسان وسرعته.
              </span>
              <span className={styles.label}>
                <Swords size={15} aria-hidden="true" />
                <span>الإسطبل<small><bdi dir="ltr">Lv.{props.village.buildings.stable}</bdi></small></span>
              </span>
            </button>
            <button
              type="button"
              className={`${styles.hotspot} ${styles.region} ${styles.rally}`}
              data-priority="primary"
              style={rectStyle(getVillageRect('rally', props.debug))}
              aria-label="نقطة تجمع الجيوش، مركز القيادة العسكرية"
              aria-pressed={props.selected === 'rally'}
              data-building-region="rally"
              data-rally-point="true"
              data-label-id="rally"
              onClick={() => choose('rally')}
              onPointerEnter={() => highlight('rally')}
              onPointerLeave={() => highlight(null)}
              onFocus={() => highlight('rally')}
              onBlur={() => highlight(null)}
            >
              <span className={styles.rallyMark} aria-hidden="true">
                <Flag size={18} />
              </span>
              <RallyPointBadge props={props} />
              <span className={styles.label}>
                <span>نقطة تجمع الجيوش</span>
                <small>القيادة</small>
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
                data-label-id={region.id}
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
              data-label-id="gate"
              onClick={() => camera.current?.focusOn('gate', () => current.current.onWorldMap?.())}
            >
              <span className={styles.label}>
                <DoorOpen size={15} aria-hidden="true" />
                خريطة العالم
              </span>
              {props.showThreatMarker && <span className={styles.threatMarker}><Swords size={16} aria-label="مؤشر تهديد عسكري عند البوابة" /></span>}
            </button>
            <ConstructionMarker props={props} />
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

export const VillageCanvas = forwardRef<VillageSceneHandle, VillageCanvasProps>(function VillageCanvas(props, ref) {
  return props.dedicatedNavigation ? <CityHubCanvas {...props} ref={ref} /> : <ProductionVillageCanvas {...props} ref={ref} />;
});
