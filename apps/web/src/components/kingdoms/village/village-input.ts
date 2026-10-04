import type { WorldPoint } from '@/lib/kingdoms/village/types';
import type { VillageCamera } from './village-camera';

const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const center = (a: WorldPoint, b: WorldPoint): WorldPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export function bindVillageInput(element: HTMLElement, camera: VillageCamera) {
  const pointers = new Map<number, WorldPoint>();
  let origin: WorldPoint | undefined;
  let moved = false;
  let suppressClick = false;
  let lastTap: { at: number; point: WorldPoint } | undefined;
  const capture = (id: number) => {
    try {
      if (!element.hasPointerCapture(id)) element.setPointerCapture(id);
    } catch {
      /* Pointer capture is optional in embedded browsers. */
    }
  };
  const point = (event: PointerEvent | WheelEvent | MouseEvent): WorldPoint => {
    const bounds = element.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType !== 'touch') return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) {
      origin = point(event);
      moved = false;
      suppressClick = false;
    } else {
      moved = true;
      suppressClick = true;
      pointers.forEach((_, id) => capture(id));
    }
    element.dataset.dragging = 'true';
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = point(event);
    const before = [...pointers.values()];
    pointers.set(event.pointerId, next);
    if (pointers.size >= 2) {
      capture(event.pointerId);
      const after = [...pointers.values()];
      const start = center(before[0], before[1]);
      const end = center(after[0], after[1]);
      camera.panBy(end.x - start.x, end.y - start.y);
      const oldDistance = distance(before[0], before[1]);
      if (oldDistance > 0) camera.zoomAt(distance(after[0], after[1]) / oldDistance, end);
      moved = true;
    } else if (origin && (moved || distance(origin, next) > 6)) {
      capture(event.pointerId);
      camera.panBy(next.x - previous.x, next.y - previous.y);
      moved = true;
    }
    suppressClick = moved;
  };
  const end = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (!moved && event.type === 'pointerup' && event.pointerType === 'touch') {
      const next = point(event);
      const at = performance.now();
      if (lastTap && at - lastTap.at < 320 && distance(lastTap.point, next) < 28) {
        camera.zoomAt(1.55, next);
        suppressClick = true;
        lastTap = undefined;
      } else lastTap = { at, point: next };
    }
    pointers.delete(event.pointerId);
    if (!pointers.size) {
      delete element.dataset.dragging;
      origin = undefined;
    } else {
      origin = [...pointers.values()][0];
      moved = true;
    }
    try {
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
    } catch {
      /* Capture can be lost during browser gesture cancellation. */
    }
  };
  const click = (event: MouseEvent) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }
  };
  const wheel = (event: WheelEvent) => {
    event.preventDefault();
    const delta =
      event.deltaY *
      (event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? camera.getSnapshot().viewport.height
          : 1);
    camera.zoomAt(Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002), point(event));
  };
  const doubleClick = (event: MouseEvent) => {
    event.preventDefault();
    camera.zoomAt(1.6, point(event));
  };
  const key = (event: KeyboardEvent) => {
    if (event.target !== element) return;
    const direction = {
      ArrowLeft: [70, 0],
      ArrowRight: [-70, 0],
      ArrowUp: [0, 70],
      ArrowDown: [0, -70],
    }[event.key];
    if (direction) camera.panBy(direction[0], direction[1]);
    else if (event.key === '+' || event.key === '=') camera.zoomBy(1.25);
    else if (event.key === '-') camera.zoomBy(0.8);
    else if (event.key === 'Home' || event.key === '0') camera.reset();
    else return;
    event.preventDefault();
  };
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener('lostpointercapture', end);
  element.addEventListener('click', click, true);
  element.addEventListener('wheel', wheel, { passive: false });
  element.addEventListener('dblclick', doubleClick);
  element.addEventListener('keydown', key);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', end);
    element.removeEventListener('pointercancel', end);
    element.removeEventListener('lostpointercapture', end);
    element.removeEventListener('click', click, true);
    element.removeEventListener('wheel', wheel);
    element.removeEventListener('dblclick', doubleClick);
    element.removeEventListener('keydown', key);
    pointers.clear();
    delete element.dataset.dragging;
  };
}
