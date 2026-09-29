import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { moveMapCenter, type MapPoint } from './world-terrain';
import { margin, spans, type Span } from './world-map-layout';

const directions: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type Options = {
  center: MapPoint;
  origin?: MapPoint;
  radius: number;
  onCenter: (point: MapPoint) => void;
};

/**
 * Pan, zoom, drag, pinch and keyboard handling for the world map. Every gesture resolves
 * to whole-cell centres through `moveMapCenter`; the pan layer offset is presentation only.
 */
export function useWorldMapNavigation({ center, origin, radius, onCenter }: Options) {
  const [span, setSpan] = useState<Span>(9);
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const renderedCenter = useRef(center);
  const requested = useRef(center);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const zoomIn = () => setSpan((s) => spans[Math.max(0, spans.indexOf(s) - 1)]);
  const zoomOut = () => setSpan((s) => spans[Math.min(spans.length - 1, spans.indexOf(s) + 1)]);
  const pan = (dx: number, dy: number) => onCenter(moveMapCenter(center, dx, dy, radius));

  const setOffset = (x: number, y: number, animate = false) => {
    const layer = panRef.current;
    offset.current = { x, y };
    if (!layer) return;
    layer.style.transition = animate ? '' : 'none';
    layer.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : '';
  };
  const readOffset = () => {
    const layer = panRef.current;
    if (layer && typeof DOMMatrixReadOnly === 'function') {
      const value = getComputedStyle(layer).transform;
      if (value && value !== 'none') {
        const matrix = new DOMMatrixReadOnly(value);
        return { x: matrix.m41, y: matrix.m42 };
      }
    }
    return offset.current;
  };
  const settle = (from: { x: number; y: number }) => {
    if (prefersReducedMotion() || (!from.x && !from.y)) return setOffset(0, 0);
    setOffset(from.x, from.y);
    panRef.current?.getBoundingClientRect();
    setOffset(0, 0, true);
  };
  const cellSize = () => (sceneRef.current?.clientWidth ?? 0) / span;

  useLayoutEffect(() => {
    const previous = renderedCenter.current;
    renderedCenter.current = center;
    requested.current = center;
    const dx = center.x - previous.x;
    const dy = center.y - previous.y;
    if (!dx && !dy) return;
    const cell = (sceneRef.current?.clientWidth ?? 0) / span;
    const current = readOffset();
    const shifted = { x: current.x + dx * cell, y: current.y + dy * cell };
    const active = drag.current;
    if (active?.moved) {
      active.x -= dx * cell;
      active.y -= dy * cell;
      setOffset(shifted.x, shifted.y);
    } else if (cell && Math.abs(dx) <= margin && Math.abs(dy) <= margin) {
      settle(shifted);
    } else {
      setOffset(0, 0);
    }
    // Only a new centre re-bases the pan layer; the helpers read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.x, center.y]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    let accumulated = 0;
    const onWheel = (event: WheelEvent) => {
      // Trackpad pinches arrive as ctrl+wheel; plain wheel keeps scrolling the page.
      if (!event.ctrlKey) return;
      event.preventDefault();
      accumulated += event.deltaY;
      if (Math.abs(accumulated) < 40) return;
      setSpan(
        (s) =>
          spans[Math.max(0, Math.min(spans.length - 1, spans.indexOf(s) + Math.sign(accumulated)))],
      );
      accumulated = 0;
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [span]);

  const dragTo = (clientX: number, clientY: number) => {
    const active = drag.current;
    const cell = cellSize();
    if (!active || !cell) return;
    active.lastX = clientX;
    active.lastY = clientY;
    let tx = clientX - active.x;
    let ty = clientY - active.y;
    const rendered = renderedCenter.current;
    const limit = cell * 0.3;
    if ((rendered.x <= -radius && tx > limit) || (rendered.x >= radius && tx < -limit)) {
      tx = Math.sign(tx) * limit;
      active.x = clientX - tx;
    }
    if ((rendered.y <= -radius && ty > limit) || (rendered.y >= radius && ty < -limit)) {
      ty = Math.sign(ty) * limit;
      active.y = clientY - ty;
    }
    setOffset(tx, ty);
    const next = moveMapCenter(rendered, -Math.trunc(tx / cell), -Math.trunc(ty / cell), radius);
    if (next.x !== requested.current.x || next.y !== requested.current.y) {
      requested.current = next;
      onCenter(next);
    }
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    if (!active.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    const cell = cellSize();
    const current = readOffset();
    if (cell) {
      const next = moveMapCenter(
        renderedCenter.current,
        -Math.round(current.x / cell),
        -Math.round(current.y / cell),
        radius,
      );
      if (next.x !== requested.current.x || next.y !== requested.current.y) {
        requested.current = next;
        onCenter(next);
      }
    }
    settle(current);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction = directions[event.key];
    const home = event.key === 'Home' && origin;
    const zoom = { '+': -1, '=': -1, '-': 1, _: 1 }[event.key];
    if (!direction && !home && !zoom) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    if (direction) {
      const step = event.shiftKey ? 3 : 1;
      pan(direction[0] * step, direction[1] * step);
    } else if (home) {
      onCenter(moveMapCenter(origin, 0, 0, radius));
    } else if (zoom) {
      if (zoom < 0) zoomIn();
      else zoomOut();
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a.x - b.x, a.y - b.y);
      if (drag.current?.moved) settle(readOffset());
      drag.current = null;
      return;
    }
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current !== null && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = distance / pinch.current;
      if (ratio > 1.25 || ratio < 0.8) {
        if (ratio > 1) zoomIn();
        else zoomOut();
        pinch.current = distance;
      }
      return;
    }
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.moved) {
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return;
      active.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    dragTo(event.clientX, event.clientY);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    span,
    viewportRef,
    sceneRef,
    panRef,
    pan,
    zoomIn,
    zoomOut,
    onKeyDown,
    sceneHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerCancel: release,
      onClickCapture,
    },
  };
}
