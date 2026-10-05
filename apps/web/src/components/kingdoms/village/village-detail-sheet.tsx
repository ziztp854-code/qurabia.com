'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from '../village-panel.module.css';

/** The same building content remains a rail on desktop and a draggable sheet on touch layouts. */
export function VillageDetailSheet({ children, onClose, panel }: { children: ReactNode; onClose: () => void; panel?: 'rally' }) {
  const [expanded, setExpanded] = useState(panel === 'rally');
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ id: number; y: number; startedAt: number } | null>(null);
  const suppressClick = useRef(false);
  const cancelDrag = (cancelled = false) => {
    if (cancelled && drag.current) suppressClick.current = false;
    drag.current = null;
    setOffset(0);
  };
  return (
    <aside
      className={styles.rail}
      aria-label="إدارة مباني القرية"
      data-panel={panel}
      data-sheet-snap={expanded ? 'expanded' : 'compact'}
      data-dragging={offset !== 0}
      style={{ '--sheet-offset': `${Math.max(0, offset)}px` } as CSSProperties}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      }}
    >
      <button
        type="button"
        className={styles.dragHandle}
        aria-label="تغيير ارتفاع تفاصيل المبنى"
        aria-expanded={expanded}
        title={expanded ? 'تصغير التفاصيل' : 'توسيع التفاصيل'}
        onClick={() => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          setExpanded((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault(); setExpanded(event.key === 'ArrowUp');
          }
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          suppressClick.current = false;
          drag.current = { id: event.pointerId, y: event.clientY, startedAt: performance.now() };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          const delta = event.clientY - drag.current.y;
          if (Math.abs(delta) > 8) suppressClick.current = true;
          setOffset(delta);
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          const delta = event.clientY - drag.current.y;
          const velocity = delta / Math.max(1, performance.now() - drag.current.startedAt);
          if (delta > 100 || (delta > 35 && velocity > .6)) onClose();
          else if (delta < -40) setExpanded(true);
          else if (delta > 40) setExpanded(false);
          if (Math.abs(delta) > 8) suppressClick.current = true;
          cancelDrag();
        }}
        onPointerCancel={() => cancelDrag(true)}
        onLostPointerCapture={() => { if (drag.current) cancelDrag(true); }}
      >
        <span aria-hidden="true" />
      </button>
      <div className={styles.sheetContent}>{children}</div>
    </aside>
  );
}
