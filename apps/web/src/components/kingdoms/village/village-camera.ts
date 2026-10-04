import { clampCamera, createCamera } from '@/lib/kingdoms/village/cameraMath';
import type {
  CameraSnapshot,
  VillageDebugOptions,
  VillageSceneHandle,
  VillageTarget,
  WorldSize,
} from '@/lib/kingdoms/village/types';

export class VillageCamera implements VillageSceneHandle {
  private camera: CameraSnapshot;
  private frame = 0;
  private listeners = new Set<(camera: CameraSnapshot) => void>();
  private disposed = false;
  reducedMotion = false;
  debug?: VillageDebugOptions;

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
  focusOn(target: VillageTarget, onComplete?: () => void) {
    void target;
    onComplete?.();
  }
  zoomBy() {}
  zoomAt() {}
  panBy() {}
  reset = () => {
    this.cancel();
    this.publish(createCamera(this.camera.viewport));
  };
  resize(viewport: WorldSize) {
    this.cancel();
    this.publish(createCamera(viewport));
  }
  destroy() {
    this.cancel();
    this.disposed = true;
    this.listeners.clear();
  }
}
