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
  useCallback,
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
import { villageAssets, villageArtRenditions } from '@/lib/kingdoms/village/assetManifest';
import { getCityComposition, getCityPlacement, type CityCompositionId } from '@/lib/kingdoms/village/city-composition';
import { getVillageLabelDensity, villageLabelPoint, visibleVillageLabels, type VillageLabelDensity } from '@/lib/kingdoms/village/labelLayout';
import {
  buildingGroups,
  buildingStatusLabels,
  getBuildingPresentation,
  villageBuildingSceneStatus,
} from '@/lib/kingdoms/village/buildingConfig';
import { createCamera, projectPoint } from '@/lib/kingdoms/village/cameraMath';
import { getVillageRect, VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import { resolveVillageQuality } from '@/lib/kingdoms/village/quality';
import { visibleMapAnchor } from '@/lib/kingdoms/village/visibleMapRect';
import type {
  VillageCanvasProps,
  VillageSceneHandle,
  VillageSelection,
  CameraSnapshot,
  WorldRect,
  VillageTarget,
} from '@/lib/kingdoms/village/types';
import { VillageCamera } from './village-camera';
import { bindVillageInput } from './village-input';
import type { VillageRenderer } from './village-renderer';
import styles from './city-hub-canvas.module.css';

const icons = {
  hall: Castle,
  stable: Swords,
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

function deviceQuality(props: VillageCanvasProps, width: number) {
  const device = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return resolveVillageQuality(props.quality, {
    width,
    memory: device.deviceMemory,
    cores: device.hardwareConcurrency,
    dpr: devicePixelRatio,
    saveData: device.connection?.saveData,
  });
}

export const CityHubCanvas = forwardRef<VillageSceneHandle, VillageCanvasProps>(
  function CityHubCanvas(props, ref) {
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
    const [composition, setComposition] = useState<CityCompositionId>('desktop');
    const compositionRef = useRef<CityCompositionId>('desktop');
    const city = getCityComposition(composition === 'desktop' ? { width:1600,height:900 } : { width:900,height:1600 });
    const cityEnabled = props.dedicatedNavigation === true;
    const rect = useCallback((id: Parameters<typeof getVillageRect>[0]) => cityEnabled ? getCityPlacement(id, compositionRef.current, current.current.debug) : getVillageRect(id,current.current.debug),[cityEnabled]);
    const renderRect = (id: Parameters<typeof getVillageRect>[0]) => cityEnabled ? getCityPlacement(id, composition, props.debug) : getVillageRect(id, props.debug);
    const [retry, setRetry] = useState(0);
    const [clock, setClock] = useState({ base: props.view.serverNow, elapsed: 0 });
    const announced = useRef(false);
    const descriptionId = useId();
    const coordinateReadout = useRef<HTMLSpanElement>(null);
    const resizeScene = useRef<(() => void) | null>(null);
    const syncRendererVisibility = useRef<(() => void) | null>(null);
    const labelDensity = useRef<VillageLabelDensity | undefined>(undefined);
    const syncLabels = useCallback((snapshot: CameraSnapshot, active: string | null = current.current.selected) => {
      const anchors = [...buildingKeys, 'tower', 'gate', ...(current.current.onFacilitySelect ? ['rally', 'siege'] : [])] .map((id) => {
        const area = rect(id as Parameters<typeof getVillageRect>[0]);
        return { id, x: area.x + area.width / 2, y: area.y + area.height / 2 - Math.max(area.height, 44 / snapshot.scale) * .3 };
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
        element.dataset.labelActive = String(element.dataset.labelId === active);
        const anchor = anchors.find(({ id }) => id === element.dataset.labelId);
        if (!anchor) return;
        const original = projectPoint(anchor, snapshot);
        const positioned = villageLabelPoint(anchor, snapshot, active, topInset);
        element.style.setProperty('--label-shift-x', `${(positioned.x - original.x) / snapshot.scale}px`);
        element.style.setProperty('--label-shift-y', `${(positioned.y - original.y) / snapshot.scale}px`);
      });
    },[rect]);
    const highlight = (building: VillageSelection | null) => {
      renderer.current?.hover(building);
      if (camera.current) syncLabels(camera.current.getSnapshot(), building ?? current.current.selected);
    };
    const choose = useCallback((building: VillageSelection) => {
      current.current.onSelectionStart?.();
      if (current.current.dedicatedNavigation) camera.current?.focusForScene(building, () => current.current.onSelect(building));
      else camera.current?.focusOn(building, () => current.current.onSelect(building));
    },[]);
    const chooseFacility = useCallback((facility: 'war-council' | 'siege-workshop') => {
      current.current.onSelectionStart?.();
      camera.current?.focusForScene(facility === 'war-council' ? 'rally' : 'siege', () => current.current.onFacilitySelect?.(facility));
    },[]);
    const selectTarget = useCallback((target: VillageTarget) => {
      if (target==='rally'||target==='siege') chooseFacility(target==='rally'?'war-council':'siege-workshop');
      else if(target==='gate')camera.current?.focusForScene('gate',()=>current.current.onWorldMap?.());
      else choose(target);
    },[choose,chooseFacility]);

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
        focusForScene: (target, complete) => camera.current?.focusForScene(target, complete),
        restore: (snapshot) => camera.current?.restore(snapshot),
        stop: () => camera.current?.stop(),
        enterBuildingScene: () => camera.current?.enterBuildingScene(),
      }),
      [],
    );

    useEffect(() => {
      const wasActive = current.current.active !== false;
      current.current = cityEnabled ? { ...props,cityComposition:composition } : props;
      if (!wasActive && props.active !== false) resizeScene.current?.();
      syncRendererVisibility.current?.();
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
        renderer.current.update(current.current, deviceQuality(current.current, stage.current.clientWidth));
    }, [props, composition, cityEnabled, syncLabels]);

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
      const profile = getCityComposition(initialBounds);
      compositionRef.current = profile.id;
      if (cityEnabled) {
        setComposition(profile.id);
        current.current = { ...current.current,cityComposition:profile.id };
      }
      const controller = new VillageCamera(initialBounds,false,cityEnabled ? profile.world : undefined);
      if (cityEnabled) controller.getPlacement = (target) => getCityPlacement(target,compositionRef.current,current.current.debug);
      controller.reducedMotion = current.current.reducedMotion;
      controller.debug = current.current.debug;
      controller.getFocusAnchor = () => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return undefined;
        const layout = element.closest('[data-selected]');
        const overlays = Array.from(layout?.querySelectorAll<HTMLElement>(
          'aside, nav, header, details[open], [aria-label="كاميرا القرية"], [aria-label="مستويات عرض المملكة"]',
        ) ?? []).map((overlay) => overlay.getBoundingClientRect())
          .filter(({ width, height }) => width > 0 && height > 0);
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
        element.dataset.cameraState = snapshot.state ?? 'CITY_OVERVIEW';
        element.dataset.worldWidth = String(snapshot.world?.width ?? VILLAGE_WORLD.width);
        element.dataset.worldHeight = String(snapshot.world?.height ?? VILLAGE_WORLD.height);
        syncLabels(snapshot);
        if (coordinateReadout.current)
          coordinateReadout.current.textContent = `X ${snapshot.x.toFixed(1)} / Y ${snapshot.y.toFixed(1)} · Zoom ${snapshot.zoom.toFixed(2)}× · World ${VILLAGE_WORLD.width} × ${VILLAGE_WORLD.height}`;
        scene?.camera(snapshot);
      });
      const inputCleanup = bindVillageInput(element, controller);
      const resize = () => {
        // A dedicated scene keeps the city mounted; hidden dimensions must not overwrite its camera.
        if (current.current.active === false) return;
        if (cityEnabled) {
          const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
          const top = Math.max(0, element.getBoundingClientRect().top);
          const navigation = Array.from(document.querySelectorAll<HTMLElement>('[aria-label="تنقل المملكة"], [aria-label="التنقل من القرية"]'))
            .map((node) => ({ node, rect: node.getBoundingClientRect() }))
            .filter(({ rect }) => rect.width > 0 && rect.height > 0);
          const footer = Math.max(0, ...navigation.map(({ node, rect }) =>
            getComputedStyle(node).position === 'fixed' ? Math.max(rect.height, viewportHeight - rect.top) : rect.height));
          element.style.setProperty('--city-available-height', `${Math.max(160, viewportHeight - top - footer - 12)}px`);
        }
        if (window.innerWidth <= 1000 && current.current.selected) {
          const rect = element.getBoundingClientRect();
          const sheet = element.closest('[data-selected]')?.querySelector('aside');
          const sheetTop = sheet?.getBoundingClientRect().top ?? window.innerHeight * .56 - 82;
          if (rect.top >= sheetTop - 80 || rect.bottom <= 48) {
            element.scrollIntoView?.({ block: 'start', behavior: 'instant' });
          }
          element.style.setProperty('--stage-top', `${Math.max(0, element.getBoundingClientRect().top)}px`);
        }
        const nextBounds=bounds();
        if (cityEnabled) {
          const nextProfile=getCityComposition(nextBounds);
          compositionRef.current=nextProfile.id;
          setComposition(nextProfile.id);
          current.current={...current.current,cityComposition:nextProfile.id};
          controller.resize(nextBounds,nextProfile.world);
        } else controller.resize(nextBounds);
        if (current.current.selected) {
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
        scene?.update(current.current, deviceQuality(current.current, element.clientWidth));
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
      if (cityEnabled) {
        const hud = element.closest('div[dir="rtl"]')?.querySelector('[aria-label="موارد القرية"]')?.parentElement;
        if (hud) observer?.observe(hud);
        document.querySelectorAll<HTMLElement>('[aria-label="تنقل المملكة"], [aria-label="التنقل من القرية"]')
          .forEach((node) => observer?.observe(node));
      }
      window.addEventListener('resize', resize);
      let inViewport = true;
      const syncVisibility = () => scene?.setVisible(current.current.active !== false && !document.hidden && inViewport);
      syncRendererVisibility.current = syncVisibility;
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
            deviceQuality(current.current, element.clientWidth),
            colors,
            cityEnabled ? {
              onSelect: (target) => selectTarget(target),
              onHover: (target) => {
                element.dataset.hoveredLandmark=target ?? '';
                if (controller)syncLabels(controller.getSnapshot(),target);
                if (target && target !== 'gate' && target !== 'rally' && target !== 'siege') current.current.onPrefetch?.(target);
              },
            } : undefined,
          );
          if (!active) {
            next.destroy();
            return;
          }
          scene = next;
          renderer.current = next;
          scene.update(current.current, deviceQuality(current.current, element.clientWidth));
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
        syncRendererVisibility.current = null;
      };
    }, [retry, cityEnabled, selectTarget, syncLabels]);

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

    useEffect(() => {
      if (!props.village.build || props.active === false) return;
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
    }, [props.village.build, props.view.serverNow, props.active]);

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
        data-threat-severity={props.threatSeverity}
        data-city-composition={cityEnabled ? composition : undefined}
        data-camera-state="CITY_OVERVIEW"
        data-zoom="1"
        data-labels={props.showLabels}
        data-focused={props.selected !== null}
        data-debug-hitboxes={process.env.NODE_ENV === 'development' && props.debug?.hitboxes}
      >
        <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
        <div
          ref={terrain}
          className={styles.terrain}
          style={cityEnabled ? city.world : { width: VILLAGE_WORLD.width, height: VILLAGE_WORLD.height }}
        >
          <picture>
            {cityEnabled ? <>
              <source media="(orientation: portrait) and (max-width: 700px)" type="image/webp" srcSet="/game-art/kingdoms/city-hub/overview-portrait-mobile.webp" />
              <source media="(orientation: portrait)" type="image/webp" srcSet="/game-art/kingdoms/city-hub/overview-portrait.webp" />
              <source media="(max-width: 700px)" type="image/webp" srcSet="/game-art/kingdoms/city-hub/overview-desktop-mobile.webp" />
            </> : <>
              <source type="image/avif" srcSet={villageArtRenditions.map((art) => `${art.avif} ${art.width}w`).join(', ')} sizes="(max-width: 700px) 1280px, 1672px" />
              <source type="image/webp" srcSet={villageArtRenditions.map((art) => `${art.webp} ${art.width}w`).join(', ')} sizes="(max-width: 700px) 1280px, 1672px" />
            </>}
          {/* Native picture chooses pre-encoded renditions and remains available without WebGL. */}
          <img
            key={retry}
            src={cityEnabled ? city.asset : villageAssets.base.src}
            alt=""
            width={cityEnabled ? city.world.width : VILLAGE_WORLD.width}
            height={cityEnabled ? city.world.height : VILLAGE_WORLD.height}
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
          style={cityEnabled ? city.world : { width: VILLAGE_WORLD.width, height: VILLAGE_WORLD.height }}
        >
          <div className={styles.hotspots}>
            {buildingKeys.filter((building) => building !== 'stable').map((building) => {
              const presentation = getBuildingPresentation(
                building,
                props.village,
                props.view.config,
              );
              const Icon = icons[building];
              const StatusIcon = statusIcons[presentation.status];
              const state =
                presentation.status === 'construction'
                  ? 'قيد التطوير'
                  : presentation.level > 0
                    ? `المستوى ${presentation.level.toLocaleString('ar-SA')}`
                    : 'لم يُبنَ';
              return (
                <button
                  type="button"
                  key={building}
                  className={styles.hotspot}
                  style={rectStyle(renderRect(building))}
                  aria-label={`${presentation.name}، ${state}`}
                  aria-describedby={`${descriptionId}-${building}`}
                  aria-pressed={props.selected === building}
                  data-building={building}
                  data-label-id={building}
                  data-state={presentation.status}
                  data-group={buildingGroups[building]}
                  onClick={() => choose(building)}
                  onPointerDown={() => current.current.onPrefetch?.(building)}
                  onPointerEnter={() => { highlight(building); current.current.onPrefetch?.(building); }}
                  onPointerLeave={() => highlight(null)}
                  onFocus={() => { highlight(building); current.current.onPrefetch?.(building); }}
                  onBlur={() => highlight(null)}
                >
                  <span id={`${descriptionId}-${building}`} className={styles.visuallyHidden}>
                    {presentation.description}، {buildingStatusLabels[presentation.status]}، {villageBuildingSceneStatus(building, props.village)}
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
              style={rectStyle(renderRect('stable'))}
              aria-label={`الإسطبل، المستوى ${props.village.buildings.stable.toLocaleString('ar-SA')}`}
              aria-describedby={`${descriptionId}-stable`}
              aria-pressed={props.selected === 'stable'}
              data-building-region="stable"
              data-label-id="stable"
              data-state={getBuildingPresentation('stable', props.village, props.view.config).status}
              onClick={() => choose('stable')}
              onPointerDown={() => current.current.onPrefetch?.('stable')}
              onPointerEnter={() => { highlight('stable'); current.current.onPrefetch?.('stable'); }}
              onPointerLeave={() => highlight(null)}
              onFocus={() => { highlight('stable'); current.current.onPrefetch?.('stable'); }}
              onBlur={() => highlight(null)}
            >
              <span id={`${descriptionId}-stable`} className={styles.visuallyHidden}>
                الإسطبل مبنى مستقل. مستواه يحدد تدريب الفرسان وسرعته. {villageBuildingSceneStatus('stable', props.village)}
              </span>
              <span className={styles.label}>
                <Swords size={15} aria-hidden="true" />
                <span>الإسطبل<small><bdi dir="ltr">Lv.{props.village.buildings.stable}</bdi></small></span>
              </span>
            </button>
            {supplementary.map((region) => (
              <button
                type="button"
                key={region.id}
                className={`${styles.hotspot} ${styles.region}`}
                style={rectStyle(renderRect(region.id))}
                aria-label={region.name}
                data-building-region={region.id}
                data-label-id={region.id}
                onClick={() => choose(region.building)}
              >
                <span className={styles.label}>{region.name}</span>
              </button>
            ))}
            {props.onFacilitySelect && <>
              <button type="button" className={`${styles.hotspot} ${styles.region}`} style={rectStyle(renderRect('rally'))} aria-label="مجلس الحرب" data-building-region="war-council" data-label-id="rally" data-rally-point="true" onClick={() => chooseFacility('war-council')}>
                <span className={styles.label}><Swords size={15} aria-hidden="true" />مجلس الحرب</span><RallyPointBadge props={props} />
              </button>
              <button type="button" className={`${styles.hotspot} ${styles.region}`} style={rectStyle(renderRect('siege'))} aria-label="ورشة الحصار" data-building-region="siege-workshop" data-label-id="siege" onClick={() => chooseFacility('siege-workshop')}>
                <span className={styles.label}><Swords size={15} aria-hidden="true" />ورشة الحصار</span>
              </button>
            </>}
            {cityEnabled && city.landmarks.filter(landmark=>landmark.id==='blacksmith'||landmark.id==='granary').map(landmark=><button key={landmark.id} type="button" className={`${styles.hotspot} ${styles.region}`} style={rectStyle(landmark.rect)} aria-label={landmark.name} data-building-region={landmark.id} data-label-id={landmark.id} onClick={()=>selectTarget(landmark.target!)}><span className={styles.label}>{landmark.name}</span></button>)}
            {cityEnabled && city.landmarks.filter(landmark=>landmark.classification==='decoration').map(landmark=><span key={landmark.id} role="img" aria-label={landmark.name} className={styles.decorativeLandmark} style={rectStyle(landmark.rect)} title={landmark.name} />)}
            <button
              type="button"
              className={`${styles.hotspot} ${styles.region}`}
              style={rectStyle(renderRect('gate'))}
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
            {build && (
              <div
                className={styles.construction}
                style={{
                  left:
                    renderRect(build.building).x + renderRect(build.building).width / 2,
                  top:
                    renderRect(build.building).y + renderRect(build.building).height,
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
