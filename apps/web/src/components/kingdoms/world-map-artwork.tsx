import { memo, type ReactNode } from 'react';
import type { KingdomsView } from '@/lib/kingdoms/types';
import {
  HILL_LEVEL,
  MOUNTAIN_LEVEL,
  contourPath,
  riverBands,
  riverDistance,
  riverY,
  terrainAt,
  type MapPoint,
  type TerrainKind,
} from './world-terrain';
import { cellCentre, cellKey, margin, unit } from './world-map-layout';
import styles from './world-map.module.css';

const scatter = (x: number, y: number, k: number) => {
  const n = Math.sin((x * 31.7 + y * 17.3 + k * 5.1) * 12.9898) * 43758.5453;
  return n - Math.floor(n);
};

export function Symbols({ id }: { id: string }) {
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

export const TerrainLayer = memo(function TerrainLayer({
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

export function MapDefs({ id, start }: { id: string; start: MapPoint }) {
  return (
    <defs>
      <Symbols id={id} />
      {(['forest', 'steppe', 'hills', 'mountain'] as const).map((kind) => kindGradient(id, kind))}
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
  );
}

type SceneProps = {
  id: string;
  start: MapPoint;
  span: number;
  radius: number;
  target: MapPoint;
  playerId?: string;
  villages: KingdomsView['map'];
  byCell: Map<string, KingdomsView['map'][number]>;
  territories: KingdomsView['territories'];
  route: { d: string } | null;
};

/** Server-state overlays: occupied land, route preview, settlements and the selected destination. */
export function SceneOverlay({
  id,
  start,
  span,
  radius,
  target,
  playerId,
  villages,
  byCell,
  territories,
  route,
}: SceneProps) {
  const cells = span + margin * 2;
  const px = (x: number) => cellCentre(x, start.x);
  const py = (y: number) => cellCentre(y, start.y);
  const inside = (point: MapPoint) => Math.abs(point.x) <= radius && Math.abs(point.y) <= radius;
  const inScene = (point: MapPoint) =>
    point.x >= start.x - margin &&
    point.x < start.x + span + margin &&
    point.y >= start.y - margin &&
    point.y < start.y + span + margin;
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
  return (
    <>
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
      {villages.filter(inScene).map((village) =>
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
    </>
  );
}
