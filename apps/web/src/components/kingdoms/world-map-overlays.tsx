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
import { moveMapCenter, type MapPoint } from './world-terrain';
import { spans, type Span } from './world-map-layout';
import styles from './world-map.module.css';
import { ResourceIcon } from './resource-icon';

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
        {Array.from({ length: 9 }, (_, index) => {
          const coordinate = -radius - 0.5 + ((index + 1) * size) / 10;
          return (
            <path
              key={index}
              d={`M ${coordinate} ${-radius - 0.5} v ${size} M ${-radius - 0.5} ${coordinate} h ${size}`}
              className={styles.miniGrid}
              style={{ strokeWidth: size / 300 }}
            />
          );
        })}
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
    <div className={styles.compass} aria-hidden="true">
      <ArrowUp size={16} />
      <span>شمال</span>
    </div>
  );
}

export function MapLegend({ hasResources = false }: { hasResources?: boolean }) {
  return (
    <>
      <div className={styles.legend} aria-label="مفتاح الخريطة">
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
      </div>
      {hasResources && (
        <p className={styles.resourceLegend}>
          <span>
            <ResourceIcon resource="wood" size={24} /> خشب
          </span>
          <span>
            <ResourceIcon resource="iron" size={24} /> حديد
          </span>
          <span>
            <ResourceIcon resource="food" size={24} /> قمح
          </span>
          <span>صور الموارد تحدد مواقع الجمع، والرقم يوضح المتاح الآن.</span>
        </p>
      )}
      <p className={styles.hint}>
        اسحب الخريطة أو استخدم الأسهم للتحريك (<kbd dir="ltr">Shift</kbd> لثلاث خانات)، و
        <kbd dir="ltr">+</kbd> / <kbd dir="ltr">−</kbd> للتكبير، و<kbd dir="ltr">Home</kbd> للعودة
        إلى قريتك. التضاريس خلفية بصرية؛ مواقع الجمع تحمل صور الموارد وأسماءها.
      </p>
    </>
  );
}
