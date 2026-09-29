'use client';

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Crosshair,
  LocateFixed,
  Minus,
  Navigation2,
  Plus,
} from 'lucide-react';
import type { KingdomsView } from '@/lib/kingdoms/types';
import {
  HILL_LEVEL,
  MOUNTAIN_LEVEL,
  contourPath,
  moveMapCenter,
  riverBands,
  riverDistance,
  riverY,
  terrainAt,
  terrainLabel,
  type MapPoint,
  type TerrainKind,
} from './world-terrain';
import styles from './world-map.module.css';

type Props = {
  center: MapPoint;
  target: MapPoint;
  origin?: MapPoint;
  radius: number;
  playerId?: string;
  villages: KingdomsView['map'];
  territories: KingdomsView['territories'];
  onCenter: (point: MapPoint) => void;
  onSelect: (point: MapPoint) => void;
};

const unit = 90;
/** Cells rendered beyond each edge so dragging reveals continuous land instead of a blank edge. */
const margin = 3;
const spans = [7, 9, 11, 13] as const;
const cellKey = (x: number, y: number) => `${x},${y}`;
const scatter = (x: number, y: number, k: number) => {
  const n = Math.sin((x * 31.7 + y * 17.3 + k * 5.1) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
};
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

function Symbols({ id }: { id: string }) {
  return (
    <>
      <symbol id={`${id}-tree`} overflow="visible">
        <ellipse cx="4" cy="2" rx="11" ry="4" className={styles.shadow} />
        <path d="M0 2V-9" className={styles.trunk} />
        <circle cy="-15" r="10" className={styles.tree} />
        <circle cx="-3.5" cy="-18" r="5" className={styles.treeLight} />
      </symbol>
      <symbol id={`${id}-pine`} overflow="visible">
        <ellipse cx="4" cy="2" rx="9" ry="3.5" className={styles.shadow} />
        <path d="M0 2V-6" className={styles.trunk} />
        <path d="M-9-4 0-29 9-4Z" className={styles.tree} />
        <path d="M0-29 9-4H0Z" className={styles.treeShade} />
      </symbol>
      <symbol id={`${id}-peak`} overflow="visible">
        <ellipse cx="12" cy="6" rx="36" ry="10" className={styles.shadow} />
        <path d="M-34 4 0-46 34 4Z" className={styles.mountain} />
        <path d="M0-46 34 4 6-4Z" className={styles.mountainShade} />
        <path d="M-34 4 0-46-10-2Z" className={styles.mountainLight} />
      </symbol>
      <symbol id={`${id}-snow`} overflow="visible">
        <path d="m-10-31 10-15 11 16-8-4-5 5Z" className={styles.snow} />
      </symbol>
      <symbol id={`${id}-hill`} overflow="visible">
        <ellipse cx="6" cy="4" rx="30" ry="7" className={styles.shadow} />
        <path d="M-28 4C-18-17 14-21 28 4Z" className={styles.hill} />
        <path d="M2-14C14-12 22-6 28 4H4Z" className={styles.hillShade} />
      </symbol>
      <symbol id={`${id}-tuft`} overflow="visible">
        <path d="m-5 0 2-6m3 6V-8m3 8 2-6" className={styles.tuft} />
      </symbol>
      <symbol id={`${id}-rock`} overflow="visible">
        <path d="m-7 2 2-6 6-2 6 3 1 5Z" className={styles.rock} />
      </symbol>
      <symbol id={`${id}-field`} overflow="visible">
        <path d="M-22 7-10-9h32L10 7Z" className={styles.field} />
        <path d="m-15 7 12-16m5 16L14-9m-21 16L5-9" className={styles.furrow} />
      </symbol>
    </>
  );
}

function kindGradient(id: string, kind: Exclude<TerrainKind, 'plain'>) {
  return (
    <radialGradient key={kind} id={`${id}-${kind}`}>
      <stop className={styles[`${kind}Core`]} />
      <stop offset="0.55" className={styles[`${kind}Core`]} />
      <stop offset="1" className={styles[`${kind}Edge`]} />
    </radialGradient>
  );
}

type TerrainProps = {
  id: string;
  startX: number;
  startY: number;
  span: number;
  radius: number;
  /** Settled cells joined by `|`; a primitive keeps memoisation cheap across refreshes. */
  settled: string;
};

const TerrainLayer = memo(function TerrainLayer({
  id,
  startX,
  startY,
  span,
  radius,
  settled,
}: TerrainProps) {
  const cells = span + margin * 2;
  const from = { x: startX - margin, y: startY - margin };
  const start = { x: startX, y: startY };
  const blocked = new Set(settled.split('|'));
  const px = (x: number) => (x - startX + 0.5) * unit;
  const py = (y: number) => (y - startY + 0.5) * unit;
  const points = Array.from({ length: cells * cells }, (_, i) => {
    const x = from.x + (i % cells);
    const y = from.y + Math.floor(i / cells);
    return { x, y, terrain: terrainAt(x, y) };
  });
  const top = -margin * unit;
  const extent = cells * unit;
  const rivers = riverBands(from.x - 1, from.x + cells + 1, from.y - 1, from.y + cells + 1).map(
    (band) =>
      Array.from({ length: cells * 4 + 9 }, (_, i) => {
        const x = from.x - 1.5 + i / 4;
        return `${i ? 'L' : 'M'}${px(x).toFixed(1)} ${py(riverY(x, band)).toFixed(1)}`;
      }).join(''),
  );
  const contour = (level: number) =>
    contourPath(start, { x: from.x - 0.5, y: from.y - 0.5 }, cells, unit, level);
  const grid = Array.from(
    { length: cells + 1 },
    (_, i) => `M${top + i * unit} ${top}V${top + extent}M${top} ${top + i * unit}H${top + extent}`,
  ).join('');
  const inner = {
    x: px(-radius) - unit / 2,
    y: py(-radius) - unit / 2,
    size: (radius * 2 + 1) * unit,
  };

  return (
    <g>
      <rect x={top} y={top} width={extent} height={extent} className={styles.ground} />
      {points.map(({ x, y, terrain }) =>
        terrain.kind === 'plain' ? null : (
          <ellipse
            key={cellKey(x, y)}
            cx={px(x)}
            cy={py(y)}
            rx={unit * (0.82 + terrain.seed * 0.22)}
            ry={unit * (0.72 + terrain.seed * 0.18)}
            fill={`url(#${id}-${terrain.kind})`}
          />
        ),
      )}
      <rect x={top} y={top} width={extent} height={extent} fill={`url(#${id}-grain)`} />
      <path d={contour(HILL_LEVEL - 0.05)} className={styles.contourFaint} />
      <path d={contour(HILL_LEVEL)} className={styles.contour} />
      <path d={contour(MOUNTAIN_LEVEL)} className={styles.contourIndex} />
      <path d={contour(MOUNTAIN_LEVEL + 0.06)} className={styles.contour} />
      {rivers.map((d, i) => (
        <g key={i}>
          <path d={d} className={styles.riverBank} />
          <path d={d} className={styles.river} />
          <path d={d} className={styles.riverShine} />
        </g>
      ))}
      <path d={grid} className={styles.grid} />
      {points.map(({ x, y, terrain }) => {
        if (
          Math.abs(x) > radius ||
          Math.abs(y) > radius ||
          blocked.has(cellKey(x, y)) ||
          riverDistance(x, y) < 0.55
        )
          return null;
        const cx = px(x);
        const cy = py(y);
        const r = (k: number) => scatter(x, y, k);
        const use = (symbol: string, dx: number, dy: number, scale = 1, k = 0) => (
          <use
            key={k}
            href={`#${id}-${symbol}`}
            transform={`translate(${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}) scale(${scale.toFixed(2)})`}
          />
        );
        let marks: ReactNode[] = [];
        if (terrain.kind === 'forest') {
          const count = 3 + Math.floor(terrain.seed * 3);
          marks = Array.from({ length: count }, (_, k) => ({
            dx: (r(k) - 0.5) * unit * 0.72,
            dy: (r(k + 9) - 0.5) * unit * 0.56 + 10,
            k,
          }))
            .sort((a, b) => a.dy - b.dy)
            .map(({ dx, dy, k }) =>
              use(
                terrain.moisture > 0.7 || r(k + 20) > 0.55 ? 'pine' : 'tree',
                dx,
                dy,
                0.78 + r(k + 30) * 0.32,
                k,
              ),
            );
        } else if (terrain.kind === 'mountain') {
          const snowy = terrain.elevation > MOUNTAIN_LEVEL + 0.05;
          marks = [
            use('peak', -14 + r(1) * 8, 4, 0.62 + terrain.seed * 0.22, 0),
            use('peak', 12 + r(2) * 6, 20, 0.8 + terrain.seed * 0.25, 1),
          ];
          if (snowy) marks.push(use('snow', 12 + r(2) * 6, 20, 0.8 + terrain.seed * 0.25, 2));
        } else if (terrain.kind === 'hills') {
          marks = [
            use('hill', -12, 2, 0.7 + r(1) * 0.2, 0),
            use('hill', 14, 20, 0.85 + r(2) * 0.2, 1),
          ];
        } else if (terrain.kind === 'plain') {
          marks = [use('tuft', -18 + r(1) * 10, -8, 1, 0), use('tuft', 14, 16 + r(2) * 8, 0.9, 1)];
          if (terrain.seed < 0.1) marks.push(use('field', 0, 4, 1, 2));
          else if (terrain.seed > 0.84) marks.push(use('tree', 16, 14, 0.85, 3));
        } else {
          marks = [use('tuft', -16, 10, 0.8, 0)];
          if (terrain.seed > 0.7) marks.push(use('rock', 14 - r(1) * 8, -6 + r(2) * 12, 1.1, 1));
        }
        return (
          <g key={cellKey(x, y)} data-terrain={terrain.kind}>
            {marks}
          </g>
        );
      })}
      <path
        d={`M${top} ${top}h${extent}v${extent}h${-extent}Z M${inner.x} ${inner.y}v${inner.size}h${inner.size}v${-inner.size}Z`}
        className={styles.outside}
        fillRule="evenodd"
      />
      <rect
        x={inner.x}
        y={inner.y}
        width={inner.size}
        height={inner.size}
        className={styles.worldEdge}
      />
    </g>
  );
});

function Citadel({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className={styles.settlement} data-own="true">
      <ellipse cy="22" cx="4" rx="44" ry="15" className={styles.shadow} />
      <ellipse cy="15" rx="41" ry="17" className={styles.ownGround} />
      <path d="M-30 16V-8h60v24Z" className={styles.castleWall} />
      <path d="M6-8h24v24H6Z" className={styles.castleShade} />
      <path
        d="M-32-8v-6h6v3h5v-3h6v3h5v-3h6v3h5v-3h6v3h5v-3h6v3h5v-3h6v6"
        className={styles.castleWall}
      />
      <path d="M-13-8v-12h26v12" className={styles.castleWall} />
      <path d="M-13-20a13 13 0 0 1 26 0Z" className={styles.dome} />
      <path d="M0-33v-6" className={styles.flagPole} />
      <path d="M22 16V-30h8v46" className={styles.castleWall} />
      <path d="M21-30a5 5 0 0 1 10 0Z" className={styles.dome} />
      <path d="M26-35v-24" className={styles.flagPole} />
      <path d="M27-59 47-54 27-49Z" className={styles.ownFlag} />
      <path d="M-5 16V6a5 5 0 0 1 10 0v10Z" className={styles.gate} />
    </g>
  );
}

function Town({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className={styles.settlement}>
      <ellipse cy="16" cx="4" rx="34" ry="12" className={styles.shadow} />
      <path d="m-30 10 30-15 32 15-30 17Z" className={styles.castleGround} />
      <path d="M-22-6h44v18h-44Z" className={styles.castleWall} />
      <path d="M4-6h18v18H4Z" className={styles.castleShade} />
      <path d="M-8 10v-26H8v26" className={styles.castleWall} />
      <path d="m-12-16 12-13 12 13Z" className={styles.roof} />
      <path d="M-24-6v-5h4v3h4v-3h4v5m20 0v-5h4v3h4v-3h4v5" className={styles.castleWall} />
      <path d="M-4 12V5a4 4 0 0 1 8 0v7Z" className={styles.gate} />
      <path d="M0-29v-14" className={styles.flagPole} />
      <path d="M1-43 18-39 1-35Z" className={styles.otherFlag} />
    </g>
  );
}

function Beacon({
  point,
  center,
  label,
  kind,
  onCenter,
}: {
  point: MapPoint;
  center: MapPoint;
  label: string;
  kind: 'home' | 'target';
  onCenter: (point: MapPoint) => void;
}) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  return (
    <button
      type="button"
      className={styles.beacon}
      data-kind={kind}
      style={{ left: `${50 + (dx / reach) * 42}%`, top: `${50 + (dy / reach) * 42}%` }}
      aria-label={`${label}، X ${point.x}، Y ${point.y}`}
      onClick={() => onCenter(point)}
    >
      <Navigation2
        size={16}
        aria-hidden="true"
        style={{ transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg)` }}
      />
    </button>
  );
}

function Overview({
  radius,
  center,
  span,
  villages,
  playerId,
  onCenter,
}: {
  radius: number;
  center: MapPoint;
  span: number;
  villages: Props['villages'];
  playerId?: string;
  onCenter: (point: MapPoint) => void;
}) {
  const size = radius * 2 + 1;
  const relief = useMemo(() => {
    const step = Math.max(1, Math.ceil(size / 36));
    const out: { x: number; y: number; kind: TerrainKind }[] = [];
    for (let y = -radius; y <= radius; y += step)
      for (let x = -radius; x <= radius; x += step) {
        const kind = terrainAt(x, y).kind;
        if (kind !== 'plain') out.push({ x, y, kind });
      }
    const rivers = riverBands(-radius, radius, -radius, radius).map((band) =>
      Array.from({ length: 49 }, (_, i) => {
        const x = -radius - 0.5 + (size * i) / 48;
        return `${i ? 'L' : 'M'}${x.toFixed(2)} ${riverY(x, band).toFixed(2)}`;
      }).join(''),
    );
    return { step, cells: out, rivers };
  }, [radius, size]);
  const half = Math.floor(span / 2);
  const dot = Math.max(0.7, size / 55);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      className={styles.overview}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        if (!box.width) return;
        const x = Math.round(-radius - 0.5 + ((event.clientX - box.left) / box.width) * size);
        const y = Math.round(-radius - 0.5 + ((event.clientY - box.top) / box.height) * size);
        onCenter(moveMapCenter({ x, y }, 0, 0, radius));
      }}
    >
      <svg viewBox={`${-radius - 0.5} ${-radius - 0.5} ${size} ${size}`}>
        <rect
          x={-radius - 0.5}
          y={-radius - 0.5}
          width={size}
          height={size}
          className={styles.ground}
        />
        {relief.cells.map((cell) => (
          <rect
            key={cellKey(cell.x, cell.y)}
            x={cell.x - 0.5}
            y={cell.y - 0.5}
            width={relief.step}
            height={relief.step}
            className={styles[`${cell.kind}Mini`]}
          />
        ))}
        {relief.rivers.map((d, i) => (
          <path key={i} d={d} className={styles.riverMini} style={{ strokeWidth: size / 60 }} />
        ))}
        {villages.map((village) => (
          <circle
            key={village.id}
            cx={village.x}
            cy={village.y}
            r={village.ownerId === playerId ? dot * 1.6 : dot}
            className={village.ownerId === playerId ? styles.ownDot : styles.otherDot}
          />
        ))}
        <rect
          x={center.x - half - 0.5}
          y={center.y - half - 0.5}
          width={span}
          height={span}
          className={styles.overviewFrame}
          style={{ strokeWidth: size / 70 }}
        />
      </svg>
    </button>
  );
}

export function WorldMap({
  center,
  target,
  origin,
  radius,
  playerId,
  villages,
  territories,
  onCenter,
  onSelect,
}: Props) {
  const [span, setSpan] = useState<(typeof spans)[number]>(9);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
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

  const half = Math.floor(span / 2);
  const start = { x: center.x - half, y: center.y - half };
  const cells = span + margin * 2;
  const index = spans.indexOf(span);
  const zoomIn = () => setSpan((s) => spans[Math.max(0, spans.indexOf(s) - 1)]);
  const zoomOut = () => setSpan((s) => spans[Math.min(spans.length - 1, spans.indexOf(s) + 1)]);
  const visible = (point: MapPoint) =>
    point.x >= start.x &&
    point.x < start.x + span &&
    point.y >= start.y &&
    point.y < start.y + span;
  const inScene = (point: MapPoint) =>
    point.x >= start.x - margin &&
    point.x < start.x + span + margin &&
    point.y >= start.y - margin &&
    point.y < start.y + span + margin;
  const inside = (point: MapPoint) => Math.abs(point.x) <= radius && Math.abs(point.y) <= radius;
  const pan = (dx: number, dy: number) => onCenter(moveMapCenter(center, dx, dy, radius));
  const px = (x: number) => (x - start.x + 0.5) * unit;
  const py = (y: number) => (y - start.y + 0.5) * unit;

  const byCell = useMemo(() => new Map(villages.map((v) => [cellKey(v.x, v.y), v])), [villages]);
  const settled = useMemo(
    () =>
      villages
        .filter(
          (v) =>
            v.x >= start.x - margin &&
            v.x < start.x + span + margin &&
            v.y >= start.y - margin &&
            v.y < start.y + span + margin,
        )
        .map((v) => cellKey(v.x, v.y))
        .sort()
        .join('|'),
    [villages, start.x, start.y, span],
  );

  const sceneCells = Array.from({ length: cells * cells }, (_, i) => ({
    x: start.x - margin + (i % cells),
    y: start.y - margin + Math.floor(i / cells),
  }));
  const claims = { own: [] as string[], other: [] as string[] };
  const borders = { own: [] as string[], other: [] as string[] };
  for (const point of sceneCells) {
    const owner = territories[cellKey(point.x, point.y)];
    if (!owner || !inside(point)) continue;
    const side = owner === playerId ? 'own' : 'other';
    const x = px(point.x) - unit / 2;
    const y = py(point.y) - unit / 2;
    claims[side].push(`M${x} ${y}h${unit}v${unit}h${-unit}Z`);
    const edges: [number, number, string][] = [
      [0, -1, `M${x} ${y}h${unit}`],
      [1, 0, `M${x + unit} ${y}v${unit}`],
      [0, 1, `M${x} ${y + unit}h${unit}`],
      [-1, 0, `M${x} ${y}v${unit}`],
    ];
    for (const [dx, dy, d] of edges)
      if (territories[cellKey(point.x + dx, point.y + dy)] !== owner) borders[side].push(d);
  }

  const route =
    origin && (origin.x !== target.x || origin.y !== target.y)
      ? (() => {
          const ox = px(origin.x);
          const oy = py(origin.y);
          const tx = px(target.x);
          const ty = py(target.y);
          const length = Math.hypot(tx - ox, ty - oy);
          const bend = Math.min(0.18 * length, unit * 1.6);
          const cx = (ox + tx) / 2 + ((ty - oy) / length) * bend;
          const cy = (oy + ty) / 2 - ((tx - ox) / length) * bend;
          return {
            d: `M${ox} ${oy + 8}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${tx} ${ty + 8}`,
            mid: { x: (ox + 2 * cx + tx) / 4, y: (oy + 2 * cy + ty) / 4 },
            distance: Math.hypot(target.x - origin.x, target.y - origin.y),
          };
        })()
      : null;

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

  const hitCells = Array.from({ length: span * span }, (_, i) => ({
    x: start.x + (i % span),
    y: start.y + Math.floor(i / span),
  }));
  const settlementsInScene = villages.filter(inScene);
  const extent = cells * unit;
  const percent = (value: number) => `${(value / (span * unit)) * 100}%`;

  return (
    <section className={styles.world} aria-label="خريطة الأراضي">
      <div className={styles.controls}>
        <div className={styles.navigation} aria-label="تحريك الخريطة">
          <button
            type="button"
            aria-label="تحريك الخريطة غربًا"
            disabled={center.x <= -radius}
            onClick={() => pan(-3, 0)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="تحريك الخريطة شمالًا"
            disabled={center.y <= -radius}
            onClick={() => pan(0, -3)}
          >
            <ArrowUp size={18} />
          </button>
          <button
            type="button"
            aria-label="تحريك الخريطة جنوبًا"
            disabled={center.y >= radius}
            onClick={() => pan(0, 3)}
          >
            <ArrowDown size={18} />
          </button>
          <button
            type="button"
            aria-label="تحريك الخريطة شرقًا"
            disabled={center.x >= radius}
            onClick={() => pan(3, 0)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
        <p className={styles.readout} role="status">
          <span>المركز</span>
          <bdi dir="ltr">
            X {center.x} / Y {center.y}
          </bdi>
          <span className={styles.zoomLevel}>
            <bdi dir="ltr">
              {span}×{span}
            </bdi>
          </span>
        </p>
        <div className={styles.navigation} aria-label="تكبير الخريطة وتصغيرها">
          <button
            type="button"
            aria-label="تصغير الخريطة"
            disabled={index === spans.length - 1}
            onClick={zoomOut}
          >
            <Minus size={18} />
          </button>
          <button type="button" aria-label="تكبير الخريطة" disabled={index === 0} onClick={zoomIn}>
            <Plus size={18} />
          </button>
          {origin && (
            <button
              type="button"
              aria-label="توسيط الخريطة على قريتك"
              disabled={center.x === origin.x && center.y === origin.y}
              onClick={() => onCenter(moveMapCenter(origin, 0, 0, radius))}
            >
              <LocateFixed size={18} />
            </button>
          )}
          <button
            type="button"
            aria-label="توسيط الخريطة على الوجهة"
            disabled={center.x === target.x && center.y === target.y}
            onClick={() => onCenter(moveMapCenter(target, 0, 0, radius))}
          >
            <Crosshair size={18} />
          </button>
        </div>
      </div>
      <div className={styles.stage}>
        <div
          ref={viewportRef}
          className={styles.viewport}
          tabIndex={0}
          aria-label="مشهد العالم، استخدم الأسهم لتحريك الخريطة"
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp + - Home"
          onKeyDown={onKeyDown}
        >
          <div
            ref={sceneRef}
            className={styles.scene}
            style={{ '--span': span } as CSSProperties}
            data-dense={span > 9}
            onPointerDown={(event) => {
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
            }}
            onPointerMove={(event) => {
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
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onClickCapture={(event) => {
              if (!suppressClick.current) return;
              suppressClick.current = false;
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <div ref={panRef} className={styles.pan}>
              <svg
                viewBox={`${-margin * unit} ${-margin * unit} ${extent} ${extent}`}
                className={styles.artwork}
                style={{
                  inset: `${(-margin / span) * 100}%`,
                  inlineSize: `${(cells / span) * 100}%`,
                  blockSize: `${(cells / span) * 100}%`,
                }}
                aria-hidden="true"
              >
                <defs>
                  <Symbols id={id} />
                  {(['forest', 'steppe', 'hills', 'mountain'] as const).map((kind) =>
                    kindGradient(id, kind),
                  )}
                  <pattern
                    id={`${id}-grain`}
                    width="29"
                    height="31"
                    patternUnits="userSpaceOnUse"
                    x={-start.x * unit}
                    y={-start.y * unit}
                  >
                    <path d="m4 9 3-2m13 17 2-4M22 4l2 1" className={styles.grassMark} />
                  </pattern>
                  <pattern
                    id={`${id}-hatch`}
                    width="14"
                    height="14"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                    x={-start.x * unit}
                    y={-start.y * unit}
                  >
                    <path d="M0 0V14" className={styles.hatch} />
                  </pattern>
                  <marker
                    id={`${id}-arrow`}
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 0 10 5 0 10 3 5Z" className={styles.arrowHead} />
                  </marker>
                </defs>
                <TerrainLayer
                  id={id}
                  startX={start.x}
                  startY={start.y}
                  span={span}
                  radius={radius}
                  settled={settled}
                />
                {(['other', 'own'] as const).map((side) => (
                  <g key={side} className={styles.claim} data-side={side}>
                    <path d={claims[side].join('')} className={styles.claimTint} />
                    <path
                      d={claims[side].join('')}
                      fill={`url(#${id}-hatch)`}
                      className={styles.claimHatch}
                    />
                    <path d={borders[side].join('')} className={styles.claimBorder} />
                  </g>
                ))}
                {route && (
                  <g className={styles.routeGroup} data-route="preview">
                    <path d={route.d} className={styles.routeCasing} />
                    <path d={route.d} className={styles.route} markerEnd={`url(#${id}-arrow)`} />
                  </g>
                )}
                {sceneCells.map((point) => {
                  const key = cellKey(point.x, point.y);
                  const owner = territories[key];
                  if (!owner || byCell.has(key) || !inside(point)) return null;
                  return (
                    <g
                      key={key}
                      transform={`translate(${px(point.x) + 18} ${py(point.y) + 14})`}
                      className={styles.claimMarker}
                      data-side={owner === playerId ? 'own' : 'other'}
                    >
                      <ellipse cy="2" rx="9" ry="3.5" className={styles.shadow} />
                      <path d="M0 2V-26" className={styles.flagPole} />
                      <path d="M1-26 19-21 1-16Z" className={styles.claimFlag} />
                    </g>
                  );
                })}
                {settlementsInScene.map((village) =>
                  village.ownerId === playerId ? (
                    <g key={village.id}>
                      <ellipse
                        cx={px(village.x)}
                        cy={py(village.y) + 12}
                        rx="46"
                        ry="27"
                        className={styles.ownRing}
                      />
                      <Citadel x={px(village.x)} y={py(village.y) - 2} />
                    </g>
                  ) : (
                    <Town key={village.id} x={px(village.x)} y={py(village.y) - 2} />
                  ),
                )}
                {inScene(target) && (
                  <g
                    transform={`translate(${px(target.x)} ${py(target.y)})`}
                    className={styles.reticle}
                    data-selected="true"
                  >
                    <ellipse cy="12" rx="40" ry="24" className={styles.selectionHalo} />
                    <ellipse cy="12" rx="38" ry="23" className={styles.selection} />
                    <path
                      d="M-42-42h14M-42-42v14M42-42h-14M42-42v14M-42 42h14M-42 42v-14M42 42h-14M42 42v-14"
                      className={styles.bracket}
                    />
                  </g>
                )}
              </svg>
              <div
                className={styles.hitLayer}
                style={{ gridTemplateColumns: `repeat(${span},1fr)` }}
              >
                {hitCells.map((point) => {
                  const key = cellKey(point.x, point.y);
                  const village = byCell.get(key);
                  const owner = territories[key];
                  const selected = point.x === target.x && point.y === target.y;
                  const own = village?.ownerId === playerId;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={!inside(point)}
                      aria-label={`${village?.name ?? (owner ? 'أرض محتلة' : 'أرض خالية')}، X ${point.x}، Y ${point.y}`}
                      aria-pressed={selected}
                      onClick={() => onSelect(point)}
                      className={styles.tile}
                      data-own={own}
                      data-village={Boolean(village)}
                    >
                      {village && <span className={styles.villageName}>{village.name}</span>}
                      <span className={styles.coordinate}>
                        <bdi dir="ltr">
                          {point.x}, {point.y}
                        </bdi>
                        {inside(point) && <span>{terrainLabel(point.x, point.y)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.rulers} aria-hidden="true">
                {hitCells.slice(0, span).map((point, i) => (
                  <span key={`x${point.x}`} style={{ left: percent((i + 0.5) * unit), top: 0 }}>
                    {point.x}
                  </span>
                ))}
                {hitCells
                  .filter((_, i) => i % span === 0)
                  .map((point, i) => (
                    <span
                      key={`y${point.y}`}
                      data-axis="y"
                      style={{ top: percent((i + 0.5) * unit), left: 0 }}
                    >
                      {point.y}
                    </span>
                  ))}
              </div>
              {route &&
                route.mid.x > 0 &&
                route.mid.x < span * unit &&
                route.mid.y > 0 &&
                route.mid.y < span * unit && (
                  <span
                    className={styles.routeLabel}
                    style={{ left: percent(route.mid.x), top: percent(route.mid.y) }}
                    aria-hidden="true"
                  >
                    {route.distance.toFixed(2)} خانة
                  </span>
                )}
            </div>
          </div>
        </div>
        <svg className={styles.compass} viewBox="-30 -30 60 60" aria-hidden="true">
          <circle r="21" className={styles.compassRing} />
          <path d="M0-26 5 0 0 26-5 0Z" className={styles.compassNeedle} />
          <path d="M0-26 5 0H-5Z" className={styles.compassNorth} />
          <text y="-15" className={styles.compassText}>
            ش
          </text>
        </svg>
        {origin && !visible(origin) && (
          <Beacon
            point={origin}
            center={center}
            label="انتقل إلى قريتك"
            kind="home"
            onCenter={onCenter}
          />
        )}
        {!visible(target) && (origin?.x !== target.x || origin?.y !== target.y) && (
          <Beacon
            point={target}
            center={center}
            label="انتقل إلى الوجهة المختارة"
            kind="target"
            onCenter={onCenter}
          />
        )}
        {radius * 2 + 1 > span && (
          <Overview
            radius={radius}
            center={center}
            span={span}
            villages={villages}
            playerId={playerId}
            onCenter={onCenter}
          />
        )}
      </div>
      <div className={styles.legend} aria-hidden="true">
        <p>
          <span data-key="own">
            <i />
            قريتك
          </span>
          <span data-key="other">
            <i />
            قرية أخرى
          </span>
          <span data-key="claim-own">
            <i />
            أرضك المحتلة
          </span>
          <span data-key="claim">
            <i />
            أرض محتلة
          </span>
          <span data-key="route">
            <i />
            مسار الحملة
          </span>
        </p>
        <p>
          {(['plain', 'steppe', 'forest', 'hills', 'mountain'] as const).map((kind) => (
            <span key={kind} data-terrain={kind}>
              <i />
              {
                {
                  plain: 'سهول',
                  steppe: 'بادية',
                  forest: 'غابات',
                  hills: 'تلال',
                  mountain: 'جبال',
                }[kind]
              }
            </span>
          ))}
          <span data-terrain="river">
            <i />
            أنهار
          </span>
        </p>
      </div>
      <p className={styles.hint}>
        اسحب الخريطة أو استخدم الأسهم للتحريك (Shift لثلاث خانات)، و+ / − للتكبير، وHome للعودة إلى
        قريتك. التضاريس زينة بصرية لا تغيّر الحركة أو الإنتاج.
      </p>
    </section>
  );
}
