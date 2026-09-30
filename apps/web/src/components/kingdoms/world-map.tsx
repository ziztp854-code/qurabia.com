'use client';

import { useId, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus } from 'lucide-react';
import type { KingdomsView } from '@/lib/kingdoms/types';
import { moveMapCenter, riverY, terrainAt, type MapPoint } from './world-terrain';
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

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="5" cy="6" rx="14" ry="6" className={styles.shadow} />
      <path d="M0 7V-15" className={styles.trunk} />
      <path d="M-13-3 0-28 13-3Z" className={styles.tree} />
      <path d="M0-28 0-3 13-3Z" className={styles.treeLight} />
    </g>
  );
}

function Mountain({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="14" cy="9" rx="37" ry="12" className={styles.shadow} />
      <path d="M-34 6 0-49 34 6Z" className={styles.mountain} />
      <path d="M0-49 34 6 7-3Z" className={styles.mountainShade} />
      <path d="m-10-32 10-17 11 18-10-5-5 5Z" className={styles.snow} />
      <path d="M-34 6 0-49-11-2Z" className={styles.mountainLight} />
    </g>
  );
}

function Fortress({ x, y, own }: { x: number; y: number; own: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className={styles.fortress} data-own={own}>
      <ellipse cy="14" cx="5" rx="37" ry="16" className={styles.shadow} />
      <path d="m-34 8 32-17 37 17-32 20Z" className={styles.castleGround} />
      <path d="M-25-11H24V13H-25Z" className={styles.castleWall} />
      <path d="M5-11H24V13H5Z" className={styles.castleShade} />
      <path d="M-9 11V-25H9V11" className={styles.castleWall} />
      <path d="m-14-25 14-15 14 15Z" className={styles.roof} />
      <path d="M-29 14V-20H-16V14M16 14V-20H29V14" className={styles.castleWall} />
      <path d="M-31-20v-6h5v4h4v-4h5v6M15-20v-6h5v4h4v-4h5v6" className={styles.castleWall} />
      <path d="M-5 14V5a5 5 0 0 1 10 0v9Z" className={styles.gate} />
      <path d="M1-40V-57" className={styles.flagPole} />
      <path d="M2-57 22-52 2-47Z" className={styles.flag} />
    </g>
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
  const [span, setSpan] = useState(9);
  const id = useId().replace(/:/g, '');
  const half = Math.floor(span / 2);
  const start = { x: center.x - half, y: center.y - half };
  const size = span * unit;
  const visible = (point: MapPoint) =>
    point.x >= start.x &&
    point.x < start.x + span &&
    point.y >= start.y &&
    point.y < start.y + span;
  const pan = (dx: number, dy: number) => onCenter(moveMapCenter(center, dx, dy, radius));
  const cells = Array.from({ length: span * span }, (_, i) => ({
    x: start.x + (i % span),
    y: start.y + Math.floor(i / span),
  }));
  const features = Array.from({ length: (span + 4) ** 2 }, (_, i) => ({
    x: start.x - 2 + (i % (span + 4)),
    y: start.y - 2 + Math.floor(i / (span + 4)),
  }));
  const riverBand = Math.round((center.y - riverY(center.x)) / 18);
  const rivers = [riverBand - 1, riverBand, riverBand + 1].map((band) =>
    Array.from({ length: 81 }, (_, i) => {
      const x = start.x - 2 + ((span + 4) * i) / 80;
      return `${i ? 'L' : 'M'}${(x - start.x) * unit},${(riverY(x) + band * 18 - start.y) * unit}`;
    }).join(' '),
  );
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
        <bdi dir="ltr">
          X {center.x} / Y {center.y}
        </bdi>
        <div className={styles.navigation} aria-label="تكبير الخريطة وتصغيرها">
          <button
            type="button"
            aria-label="تصغير الخريطة"
            disabled={span === 13}
            onClick={() => setSpan(span === 7 ? 9 : 13)}
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            aria-label="تكبير الخريطة"
            disabled={span === 7}
            onClick={() => setSpan(span === 13 ? 9 : 7)}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
      <div
        className={styles.viewport}
        tabIndex={0}
        aria-label="مشهد العالم، استخدم الأسهم لتحريك الخريطة"
        onKeyDown={(event) => {
          const direction = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          }[event.key];
          if (direction) {
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            pan(direction[0], direction[1]);
          }
        }}
      >
        <div className={styles.scene} style={{ minWidth: 576, aspectRatio: '1' }}>
          <svg viewBox={`0 0 ${size} ${size}`} className={styles.artwork} aria-hidden="true">
            <defs>
              <radialGradient id={`${id}-grass`}>
                <stop stopColor="var(--terrain-meadow)" />
                <stop offset="1" stopColor="var(--terrain-earth)" />
              </radialGradient>
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
            </defs>
            <rect width={size} height={size} fill={`url(#${id}-grass)`} />
            {features.map((point) => {
              const terrain = terrainAt(point.x, point.y);
              return (
                <ellipse
                  key={`${point.x},${point.y}`}
                  cx={(point.x - start.x + 0.5) * unit}
                  cy={(point.y - start.y + 0.5) * unit}
                  rx={50 + terrain.seed * 65}
                  ry={30 + terrain.seed * 45}
                  className={terrain.kind === 'forest' ? styles.forestFloor : styles.meadowPatch}
                />
              );
            })}
            <rect width={size} height={size} fill={`url(#${id}-grain)`} />
            {rivers.map((path, i) => (
              <g key={i}>
                <path d={path} className={styles.riverBank} />
                <path d={path} className={styles.river} />
                <path d={path} className={styles.riverShine} />
              </g>
            ))}
            {features.map((point) => {
              if (
                Math.abs(point.x) > radius ||
                Math.abs(point.y) > radius ||
                villages.some((v) => v.x === point.x && v.y === point.y)
              )
                return null;
              const terrain = terrainAt(point.x, point.y);
              const x = (point.x - start.x + 0.5) * unit;
              const y = (point.y - start.y + 0.5) * unit;
              const nearRiver =
                Math.abs(
                  point.y - riverY(point.x) - Math.round((point.y - riverY(point.x)) / 18) * 18,
                ) < 0.65;
              if (nearRiver) return null;
              return (
                <g key={`${point.x},${point.y}`} data-terrain={`${point.x},${point.y}`}>
                  {terrain.kind === 'mountain' ? (
                    <>
                      <Mountain x={x - 16} y={y - 3} scale={0.65 + terrain.seed * 0.3} />
                      <Mountain x={x + 16} y={y + 15} scale={0.85 + terrain.seed * 0.25} />
                    </>
                  ) : terrain.kind === 'forest' ? (
                    Array.from({ length: 7 }, (_, i) => (
                      <Tree
                        key={i}
                        x={x + Math.sin(i * 5 + terrain.seed) * 28}
                        y={y - 18 + i * 6}
                        scale={0.7 + (i % 3) * 0.13}
                      />
                    ))
                  ) : (
                    <>
                      <path d={`M${x - 22} ${y + 6}q20 -15 46 0`} className={styles.contour} />
                      {terrain.seed > 0.7 && <Tree x={x + 15} y={y + 10} scale={0.75} />}
                    </>
                  )}
                </g>
              );
            })}
            {cells.map((point) => {
              const x = (point.x - start.x + 0.5) * unit;
              const y = (point.y - start.y + 0.5) * unit;
              const village = villages.find((v) => v.x === point.x && v.y === point.y);
              const owner = territories[`${point.x},${point.y}`];
              return (
                <g key={`${point.x},${point.y}`}>
                  {Math.abs(point.x) > radius || Math.abs(point.y) > radius ? (
                    <rect
                      x={x - unit / 2}
                      y={y - unit / 2}
                      width={unit}
                      height={unit}
                      className={styles.outside}
                    />
                  ) : village ? (
                    <>
                      {village.ownerId === playerId && (
                        <ellipse cx={x} cy={y + 12} rx="44" ry="26" className={styles.ownRing} />
                      )}
                      <Fortress x={x} y={y - 4} own={village.ownerId === playerId} />
                    </>
                  ) : owner ? (
                    <g transform={`translate(${x} ${y})`}>
                      <ellipse cy="12" rx="19" ry="7" className={styles.shadow} />
                      <path d="M0 12V-28" className={styles.flagPole} />
                      <path d="M1-28 23-22 1-16Z" className={styles.claimFlag} />
                    </g>
                  ) : null}
                  {point.x === target.x && point.y === target.y && (
                    <ellipse cx={x} cy={y + 10} rx="38" ry="23" className={styles.selection} />
                  )}
                </g>
              );
            })}
            {origin &&
              visible(origin) &&
              visible(target) &&
              (origin.x !== target.x || origin.y !== target.y) && (
                <path
                  d={`M${(origin.x - start.x + 0.5) * unit} ${(origin.y - start.y + 0.5) * unit} L${(target.x - start.x + 0.5) * unit} ${(target.y - start.y + 0.5) * unit}`}
                  className={styles.route}
                />
              )}
          </svg>
          <div className={styles.hitLayer} style={{ gridTemplateColumns: `repeat(${span},1fr)` }}>
            {cells.map((point) => {
              const village = villages.find((v) => v.x === point.x && v.y === point.y);
              const owner = territories[`${point.x},${point.y}`];
              return (
                <button
                  key={`${point.x},${point.y}`}
                  type="button"
                  disabled={Math.abs(point.x) > radius || Math.abs(point.y) > radius}
                  aria-label={`${village?.name ?? (owner ? 'أرض محتلة' : 'أرض خالية')}، X ${point.x}، Y ${point.y}`}
                  aria-pressed={point.x === target.x && point.y === target.y}
                  onClick={() => onSelect(point)}
                  className={styles.tile}
                  data-own={village?.ownerId === playerId}
                >
                  {village && <span className={styles.villageName}>{village.name}</span>}
                  <bdi dir="ltr" className={styles.coordinate}>
                    {point.x}, {point.y}
                  </bdi>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className={styles.legend} aria-hidden="true">
        <span data-own="true">
          <i />
          قريتك
        </span>
        <span>
          <i />
          قرية أخرى
        </span>
        <span data-kind="claim">
          <i />
          أرض محتلة
        </span>
      </p>
      <p className={styles.hint}>اختر موضعًا لعرضه، وحرّك العالم بالأسهم أو الأزرار.</p>
    </section>
  );
}
