'use client';

import { useId, useMemo, type CSSProperties } from 'react';
import type { KingdomsView } from '@/lib/kingdoms/types';
import { terrainLabel, type MapPoint } from './world-terrain';
import { MapDefs, SceneOverlay, TerrainLayer } from './world-map-artwork';
import { cellKey, margin, routePreview, unit, withinSpan } from './world-map-layout';
import { Beacon, Compass, MapControls, MapLegend, Overview } from './world-map-overlays';
import { useWorldMapNavigation } from './use-world-map-navigation';
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
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { span, viewportRef, sceneRef, panRef, pan, zoomIn, zoomOut, onKeyDown, sceneHandlers } =
    useWorldMapNavigation({ center, origin, radius, onCenter });
  const half = Math.floor(span / 2);
  const startX = center.x - half;
  const startY = center.y - half;
  const start = { x: startX, y: startY };
  const cells = span + margin * 2;
  const visible = (point: MapPoint) => withinSpan(point, start, span);
  const inside = (point: MapPoint) => Math.abs(point.x) <= radius && Math.abs(point.y) <= radius;
  const byCell = useMemo(() => new Map(villages.map((v) => [cellKey(v.x, v.y), v])), [villages]);
  const settled = useMemo(
    () =>
      villages
        .filter((v) => withinSpan(v, { x: startX, y: startY }, span, margin))
        .map((v) => cellKey(v.x, v.y))
        .sort()
        .join('|'),
    [villages, startX, startY, span],
  );
  const route = routePreview(origin, target, start);
  const hitCells = Array.from({ length: span * span }, (_, i) => ({
    x: start.x + (i % span),
    y: start.y + Math.floor(i / span),
  }));
  const extent = cells * unit;
  const percent = (value: number) => `${(value / (span * unit)) * 100}%`;

  return (
    <section className={styles.world} aria-label="خريطة الأراضي">
      <MapControls
        center={center}
        target={target}
        origin={origin}
        radius={radius}
        span={span}
        onPan={pan}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onCenter={onCenter}
      />
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
            {...sceneHandlers}
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
                <MapDefs id={id} start={start} />
                <TerrainLayer
                  id={id}
                  startX={start.x}
                  startY={start.y}
                  span={span}
                  radius={radius}
                  settled={settled}
                />
                <SceneOverlay
                  id={id}
                  start={start}
                  span={span}
                  radius={radius}
                  target={target}
                  playerId={playerId}
                  villages={villages}
                  byCell={byCell}
                  territories={territories}
                  route={route}
                />
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
        <Compass />
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
      <MapLegend />
    </section>
  );
}
