import { VILLAGE_WORLD, rectCenter } from './coordinates';
import type { CameraSnapshot, WorldPoint, WorldRect, WorldSize } from './types';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3.5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function createCamera(viewport: WorldSize): CameraSnapshot {
  return clampCamera({
    x: VILLAGE_WORLD.width / 2,
    y: VILLAGE_WORLD.height / 2,
    zoom: 1,
    scale: 1,
    viewport,
  });
}

export function clampCamera(camera: CameraSnapshot): CameraSnapshot {
  const width = Math.max(1, camera.viewport.width);
  const height = Math.max(1, camera.viewport.height);
  const zoom = clamp(Number.isFinite(camera.zoom) ? camera.zoom : 1, MIN_ZOOM, MAX_ZOOM);
  const scale = Math.min(width / VILLAGE_WORLD.width, height / VILLAGE_WORLD.height) * zoom;
  const halfX = Math.min(VILLAGE_WORLD.width / 2, width / scale / 2);
  const halfY = Math.min(VILLAGE_WORLD.height / 2, height / scale / 2);
  return {
    x: clamp(camera.x, halfX, VILLAGE_WORLD.width - halfX),
    y: clamp(camera.y, halfY, VILLAGE_WORLD.height - halfY),
    zoom,
    scale,
    viewport: { width, height },
  };
}

export function projectPoint(point: WorldPoint, camera: CameraSnapshot): WorldPoint {
  return {
    x: (point.x - camera.x) * camera.scale + camera.viewport.width / 2,
    y: (point.y - camera.y) * camera.scale + camera.viewport.height / 2,
  };
}

export function unprojectPoint(point: WorldPoint, camera: CameraSnapshot): WorldPoint {
  return {
    x: (point.x - camera.viewport.width / 2) / camera.scale + camera.x,
    y: (point.y - camera.viewport.height / 2) / camera.scale + camera.y,
  };
}

export function panCamera(camera: CameraSnapshot, dx: number, dy: number): CameraSnapshot {
  return clampCamera({
    ...camera,
    x: camera.x - dx / camera.scale,
    y: camera.y - dy / camera.scale,
  });
}

export function zoomCamera(
  camera: CameraSnapshot,
  factor: number,
  anchor: WorldPoint = { x: camera.viewport.width / 2, y: camera.viewport.height / 2 },
): CameraSnapshot {
  const world = unprojectPoint(anchor, camera);
  const next = clampCamera({
    ...camera,
    zoom: camera.zoom * (Number.isFinite(factor) && factor > 0 ? factor : 1),
  });
  return clampCamera({
    ...next,
    x: world.x - (anchor.x - next.viewport.width / 2) / next.scale,
    y: world.y - (anchor.y - next.viewport.height / 2) / next.scale,
  });
}

export function focusCamera(
  camera: CameraSnapshot,
  rect: WorldRect,
  anchor?: WorldPoint,
): CameraSnapshot {
  const center = rectCenter(rect);
  const baseScale = camera.scale / camera.zoom;
  const framingScale = Math.min(
    (camera.viewport.width * 0.72) / rect.width,
    (camera.viewport.height * 0.66) / rect.height,
  );
  const zoom = clamp(framingScale / baseScale, 1.6, MAX_ZOOM);
  const scale = baseScale * zoom;
  const target = anchor
    ? {
        x:
          center.x -
          (clamp(anchor.x, 0, camera.viewport.width) - camera.viewport.width / 2) / scale,
        y:
          center.y -
          (clamp(anchor.y, 0, camera.viewport.height) - camera.viewport.height / 2) / scale,
      }
    : center;
  return clampCamera({ ...camera, ...target, zoom });
}

export function resizeCamera(camera: CameraSnapshot, viewport: WorldSize): CameraSnapshot {
  return clampCamera({ ...camera, viewport });
}
