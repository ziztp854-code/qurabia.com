import {
  clampCamera,
  createCamera,
  focusCamera,
  panCamera,
  resizeCamera,
  zoomCamera,
} from '@/lib/kingdoms/village/cameraMath';
import { getVillagePlacement } from '@/lib/kingdoms/village/coordinates';
import type {
  CameraSnapshot,
  VillageDebugOptions,
  VillageSceneHandle,
  VillageTarget,
  WorldPoint,
  WorldSize,
} from '@/lib/kingdoms/village/types';

export class VillageCamera implements VillageSceneHandle {
  private camera: CameraSnapshot;
  private frame = 0;
  private listeners = new Set<(camera: CameraSnapshot) => void>();
  private disposed = false;
  reducedMotion = false;
  debug?: VillageDebugOptions;
  getFocusAnchor?: () => WorldPoint | undefined;

  constructor(viewport: WorldSize) {
    this.camera = createCamera(viewport);
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
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
  private animate(target: CameraSnapshot, onComplete?: () => void) {
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
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 650));
      const ease = 1 - (1 - progress) ** 3;
      this.publish({
        ...target,
        x: origin.x + (target.x - origin.x) * ease,
        y: origin.y + (target.y - origin.y) * ease,
        zoom: origin.zoom + (target.zoom - origin.zoom) * ease,
      });
      if (progress < 1) this.frame = requestAnimationFrame(tick);
      else {
        this.frame = 0;
        onComplete?.();
      }
    };
    this.frame = requestAnimationFrame(tick);
  }
  focusOn = (target: VillageTarget, onComplete?: () => void) => {
    const placement = getVillagePlacement(target, this.debug);
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
      onComplete,
    );
  };
  zoomBy = (factor: number) => this.animate(zoomCamera(this.camera, factor));
  zoomAt = (factor: number, anchor: WorldPoint) => {
    this.cancel();
    this.publish(zoomCamera(this.camera, factor, anchor));
  };
  panBy = (dx: number, dy: number) => {
    this.cancel();
    this.publish(panCamera(this.camera, dx, dy));
  };
  reset = () => this.animate(createCamera(this.camera.viewport));
  resize(viewport: WorldSize) {
    this.cancel();
    this.publish(resizeCamera(this.camera, viewport));
  }
  destroy() {
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }
}
