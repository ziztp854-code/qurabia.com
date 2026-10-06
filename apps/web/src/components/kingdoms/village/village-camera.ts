import {
  clampCamera,
  createCamera,
  focusCamera,
  panCamera,
  resizeCamera,
  zoomCamera,
} from '@/lib/kingdoms/village/cameraMath';
import { getVillagePlacement, VILLAGE_WORLD } from '@/lib/kingdoms/village/coordinates';
import type {
  CameraSnapshot,
  VillageDebugOptions,
  VillagePlacement,
  VillageSceneHandle,
  VillageTarget,
  WorldPoint,
  WorldSize,
} from '@/lib/kingdoms/village/types';

export class VillageCamera implements VillageSceneHandle {
  private camera: CameraSnapshot;
  private frame = 0;
  private animationRevision = 0;
  private pendingFocus?: { target: VillageTarget; onComplete?: () => void; mode: 'building' | 'scene' };
  private listeners = new Set<(camera: CameraSnapshot) => void>();
  private disposed = false;
  reducedMotion = false;
  debug?: VillageDebugOptions;
  getFocusAnchor?: () => WorldPoint | undefined;
  getPlacement?: (target: VillageTarget) => VillagePlacement;

  constructor(viewport: WorldSize, private readonly fillPortrait: boolean | (() => boolean) = false, world?: WorldSize) {
    this.camera = { ...createCamera(viewport, (typeof fillPortrait === 'function' ? fillPortrait() : fillPortrait) && viewport.height > viewport.width, world), state: 'CITY_OVERVIEW' };
  }
  getSnapshot = () => this.camera;
  subscribe(listener: (camera: CameraSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.camera);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private publish(camera: CameraSnapshot) {
    this.camera = clampCamera(camera);
    this.listeners.forEach((listener) => listener(this.camera));
  }
  private cancel() {
    this.animationRevision += 1;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.pendingFocus = undefined;
  }
  private animate(target: CameraSnapshot, onComplete?: () => void, duration = 650) {
    this.cancel();
    if (this.disposed) return;
    if (
      this.reducedMotion ||
      (Math.abs(this.camera.x - target.x) < 0.01 &&
        Math.abs(this.camera.y - target.y) < 0.01 &&
        Math.abs(this.camera.zoom - target.zoom) < 0.001)
    ) {
      this.publish(target);
      onComplete?.();
      return;
    }
    const origin = this.camera;
    const startedAt = performance.now();
    const revision = this.animationRevision;
    const tick = () => {
      if (this.disposed || revision !== this.animationRevision) return;
      const progress = Math.min(1, Math.max(0, (performance.now() - startedAt) / duration));
      const ease = 1 - (1 - progress) ** 3;
      this.publish({
        ...target,
        x: origin.x + (target.x - origin.x) * ease,
        y: origin.y + (target.y - origin.y) * ease,
        zoom: origin.zoom + (target.zoom - origin.zoom) * ease,
      });
      if (this.disposed || revision !== this.animationRevision) return;
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else {
        this.frame = 0;
        onComplete?.();
      }
    };
    this.frame = requestAnimationFrame(tick);
  }
  focusOn = (target: VillageTarget, onComplete?: () => void) => {
    const placement = this.placement(target);
    this.publish({ ...this.camera, state: 'BUILDING_FOCUS' });
    this.animate(
      focusCamera(
        this.camera,
        {
          ...placement,
          x: placement.focusX - placement.width / 2,
          y: placement.focusY - placement.height / 2,
        },
        this.getFocusAnchor?.(),
        process.env.NODE_ENV === 'development'
          ? this.debug?.placementOverrides?.[target]?.focusScale
          : undefined,
      ),
      () => { this.pendingFocus = undefined; onComplete?.(); },
    );
    if (this.frame) this.pendingFocus = { target, onComplete, mode: 'building' };
  };
  focusForScene = (target: VillageTarget, onComplete?: () => void) => {
    const placement = this.placement(target);
    this.publish({ ...this.camera, state: 'BUILDING_FOCUS' });
    this.animate(focusCamera(this.camera, {
      ...placement,
      x: placement.focusX - placement.width / 2,
      y: placement.focusY - placement.height / 2,
    }, this.getFocusAnchor?.(), Math.min(1.6, this.camera.zoom + 0.35)), () => {
      this.enterBuildingScene();
      onComplete?.();
    }, 180);
    if (this.frame) this.pendingFocus = { target, onComplete, mode: 'scene' };
  };
  private placement(target: VillageTarget) {
    return this.getPlacement?.(target) ?? getVillagePlacement(target, this.debug);
  }
  enterBuildingScene = () => {
    this.cancel();
    this.publish({ ...this.camera, state: 'BUILDING_SCENE' });
  };
  restore = (snapshot: CameraSnapshot) => {
    this.cancel();
    const savedWorld = snapshot.world ?? VILLAGE_WORLD;
    const currentWorld = this.camera.world ?? VILLAGE_WORLD;
    const sameWorld = savedWorld.width === currentWorld.width && savedWorld.height === currentWorld.height;
    this.publish({
      ...snapshot,
      world: this.camera.world,
      viewport: this.camera.viewport,
      x: sameWorld ? snapshot.x : snapshot.x / savedWorld.width * currentWorld.width,
      y: sameWorld ? snapshot.y : snapshot.y / savedWorld.height * currentWorld.height,
      state: snapshot.state ?? (snapshot.zoom === 1 ? 'CITY_OVERVIEW' : 'CITY_EXPLORE'),
    });
  };
  stop = () => {
    this.cancel();
    if (this.camera.state === 'BUILDING_FOCUS') this.publish(this.exploring(this.camera));
  };
  private exploring(camera: CameraSnapshot): CameraSnapshot {
    return { ...camera, state: camera.zoom === 1 ? 'CITY_OVERVIEW' : 'CITY_EXPLORE' };
  }
  zoomBy = (factor: number) => this.animate(this.exploring(zoomCamera(this.camera, factor)));
  zoomTo = (zoom: number, onComplete?: () => void) => {
    const target = clampCamera({ ...this.camera, zoom });
    const city = this.placement('hall');
    const anchor = this.getFocusAnchor?.();
    this.animate(this.exploring(clampCamera({
      ...target,
      x: city.focusX - ((anchor?.x ?? target.viewport.width / 2) - target.viewport.width / 2) / target.scale,
      y: city.focusY - ((anchor?.y ?? target.viewport.height / 2) - target.viewport.height / 2) / target.scale,
    })), onComplete);
  };
  zoomAt = (factor: number, anchor: WorldPoint) => {
    this.cancel();
    this.publish(this.exploring(zoomCamera(this.camera, factor, anchor)));
  };
  panBy = (dx: number, dy: number) => {
    this.cancel();
    this.publish(this.exploring(panCamera(this.camera, dx, dy)));
  };
  reset = () => {
    const fill = !this.camera.world && (typeof this.fillPortrait === 'function' ? this.fillPortrait() : this.fillPortrait) && this.camera.viewport.height > this.camera.viewport.width;
    this.animate({ ...createCamera(this.camera.viewport, fill, this.camera.world), state: 'CITY_OVERVIEW' });
  };
  resize(viewport: WorldSize, world = this.camera.world) {
    const previousWorld = this.camera.world ?? VILLAGE_WORLD;
    const nextWorld = world ?? VILLAGE_WORLD;
    const changed = previousWorld.width !== nextWorld.width || previousWorld.height !== nextWorld.height;
    if (viewport.width === this.camera.viewport.width && viewport.height === this.camera.viewport.height && !changed) return Boolean(this.pendingFocus);
    const pending = this.pendingFocus;
    this.cancel();
    const camera = changed && this.camera.state === 'CITY_OVERVIEW'
      ? { ...createCamera(viewport, false, world), state: 'CITY_OVERVIEW' as const }
      : resizeCamera({
        ...this.camera, world,
        x: changed ? this.camera.x / previousWorld.width * nextWorld.width : this.camera.x,
        y: changed ? this.camera.y / previousWorld.height * nextWorld.height : this.camera.y,
      }, viewport);
    const fill = !world && (typeof this.fillPortrait === 'function' ? this.fillPortrait() : this.fillPortrait) && viewport.height > viewport.width;
    this.publish(this.camera.state === 'CITY_OVERVIEW' ? { ...createCamera(viewport, fill, world), state: 'CITY_OVERVIEW' } : camera);
    if (pending?.mode === 'scene') this.focusForScene(pending.target, pending.onComplete);
    else if (pending) this.focusOn(pending.target, pending.onComplete);
    return Boolean(pending);
  }
  destroy() {
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }
}
