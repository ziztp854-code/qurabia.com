import { useMemo } from 'react';
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
  moveMapCenter,
  riverBands,
  riverY,
  terrainAt,
  type MapPoint,
  type TerrainKind,
} from './world-terrain';
import { cellKey, spans, type Span } from './world-map-layout';
import styles from './world-map.module.css';

type Villages = KingdomsView['map'];

export function MapControls({
  center,
  target,
  origin,
  radius,
  span,
  onPan,
  onZoomIn,
  onZoomOut,
  onCenter,
}: {
  center: MapPoint;
  target: MapPoint;
  origin?: MapPoint;
  radius: number;
  span: Span;
  onPan: (dx: number, dy: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: (point: MapPoint) => void;
}) {
  const index = spans.indexOf(span);
  return (
    <div className={styles.controls}>
      <div className={styles.navigation} aria-label="تحريك الخريطة">
        <button
          type="button"
          aria-label="تحريك الخريطة غربًا"
          disabled={center.x <= -radius}
          onClick={() => onPan(-3, 0)}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          type="button"
          aria-label="تحريك الخريطة شمالًا"
          disabled={center.y <= -radius}
          onClick={() => onPan(0, -3)}
        >
          <ArrowUp size={18} />
        </button>
        <button
          type="button"
          aria-label="تحريك الخريطة جنوبًا"
          disabled={center.y >= radius}
          onClick={() => onPan(0, 3)}
        >
          <ArrowDown size={18} />
        </button>
        <button
          type="button"
          aria-label="تحريك الخريطة شرقًا"
          disabled={center.x >= radius}
          onClick={() => onPan(3, 0)}
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
          onClick={onZoomOut}
        >
          <Minus size={18} />
        </button>
        <button type="button" aria-label="تكبير الخريطة" disabled={index === 0} onClick={onZoomIn}>
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
  );
}

export function Beacon({
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

export function Overview({
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
  villages: Villages;
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

export function Compass() {
  return (
    <svg className={styles.compass} viewBox="-30 -30 60 60" aria-hidden="true">
      <circle r="21" className={styles.compassRing} />
      <path d="M0-26 5 0 0 26-5 0Z" className={styles.compassNeedle} />
      <path d="M0-26 5 0H-5Z" className={styles.compassNorth} />
      <text y="-15" className={styles.compassText}>
        ش
      </text>
    </svg>
  );
}

export function MapLegend() {
  return (
    <>
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
        اسحب الخريطة أو استخدم الأسهم للتحريك (<kbd dir="ltr">Shift</kbd> لثلاث خانات)، و
        <kbd dir="ltr">+</kbd> / <kbd dir="ltr">−</kbd> للتكبير، و<kbd dir="ltr">Home</kbd> للعودة
        إلى قريتك. التضاريس زينة بصرية لا تغيّر الحركة أو الإنتاج.
      </p>
    </>
  );
}
