import { memo } from 'react';
import type { KingdomsView } from '@/lib/kingdoms/types';
import type { MapPoint } from './world-terrain';
import { cellCentre, cellKey, margin, unit } from './world-map-layout';
import styles from './world-map.module.css';

export const mapTerrainArt = {
  src: '/game-art/kingdoms/world-terrain-realistic.webp',
  cells: 12,
} as const;

export function MapDefs({ id, start }: { id: string; start: MapPoint }) {
  const extent = mapTerrainArt.cells * unit;
  return (
    <defs>
      <pattern
        id={`${id}-terrain`}
        data-terrain-photo="true"
        width={extent}
        height={extent}
        patternUnits="userSpaceOnUse"
        x={-start.x * unit}
        y={-start.y * unit}
      >
        <image href={mapTerrainArt.src} width={extent} height={extent} preserveAspectRatio="none" />
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

export const TerrainLayer = memo(function TerrainLayer({
  id,
  startX,
  startY,
  span,
  radius,
}: {
  id: string;
  startX: number;
  startY: number;
  span: number;
  radius: number;
}) {
  const cells = span + margin * 2;
  const top = -margin * unit;
  const extent = cells * unit;
  const inner = {
    x: (-radius - startX) * unit,
    y: (-radius - startY) * unit,
    size: (radius * 2 + 1) * unit,
  };
  const grid = Array.from(
    { length: cells + 1 },
    (_, i) => `M${top + i * unit} ${top}V${top + extent}M${top} ${top + i * unit}H${top + extent}`,
  ).join('');
  return (
    <g>
      <rect x={top} y={top} width={extent} height={extent} className={styles.ground} />
      <rect x={top} y={top} width={extent} height={extent} fill={`url(#${id}-terrain)`} />
      <rect x={top} y={top} width={extent} height={extent} className={styles.terrainShade} />
      <path d={grid} className={styles.grid} />
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

/** Coordinates and ownership are server state; the photographed terrain is decorative. */
export function SceneOverlay({
  id,
  start,
  span,
  radius,
  target,
  playerId,
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
        <g data-route="preview">
          <path d={route.d} className={styles.routeCasing} />
          <path d={route.d} className={styles.route} markerEnd={`url(#${id}-arrow)`} />
        </g>
      )}
      {sceneCells
        .filter((point) => {
          const village = byCell.get(cellKey(point.x, point.y));
          return village && village.ownerId === playerId;
        })
        .map((point) => (
          <g key={cellKey(point.x, point.y)} data-own="true">
            <path
              d={`M${px(point.x) - 39} ${py(point.y) - 39}h78v78h-78Z`}
              className={styles.homeBoundary}
            />
          </g>
        ))}
      {inScene(target) && (
        <g transform={`translate(${px(target.x)} ${py(target.y)})`} data-selected="true">
          <rect x="-43" y="-43" width="86" height="86" rx="5" className={styles.selectionHalo} />
          <path
            d="M-43-43h17M-43-43v17M43-43h-17M43-43v17M-43 43h17M-43 43v-17M43 43h-17M43 43v-17"
            className={styles.bracket}
          />
        </g>
      )}
    </>
  );
}
