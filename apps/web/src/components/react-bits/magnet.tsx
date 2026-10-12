'use client';

// Adapted from David Haz's React Bits Magnet. See THIRD_PARTY.md and LICENSE.md.
import { useEffect, useRef, type ReactNode } from 'react';
import styles from './react-bits.module.css';

/** Moves only the label, keeping the actual button and its hit target stable. */
export function Magnet({ children }: { children: ReactNode }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const label = labelRef.current;
    const target = label?.closest('a,button');
    if (!label || !target) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const reset = () => {
      label.style.transform = '';
    };
    const move = (event: PointerEvent) => {
      if (preference.matches || document.hidden || event.pointerType !== 'mouse' || event.buttons) {
        reset();
        return;
      }
      const { left, top, width, height } = target.getBoundingClientRect();
      // Original Magnet center-offset calculation, with a strict 2px limit.
      const x = Math.max(-2, Math.min(2, (event.clientX - left - width / 2) / 24));
      const y = Math.max(-2, Math.min(2, (event.clientY - top - height / 2) / 24));
      label.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    };
    target.addEventListener('pointermove', move as EventListener, { passive: true });
    target.addEventListener('pointerleave', reset);
    target.addEventListener('pointerdown', reset);
    target.addEventListener('blur', reset);
    preference.addEventListener('change', reset);
    document.addEventListener('visibilitychange', reset);
    return () => {
      target.removeEventListener('pointermove', move as EventListener);
      target.removeEventListener('pointerleave', reset);
      target.removeEventListener('pointerdown', reset);
      target.removeEventListener('blur', reset);
      preference.removeEventListener('change', reset);
      document.removeEventListener('visibilitychange', reset);
      reset();
    };
  }, []);
  return (
    <span ref={labelRef} className={styles.magnet} data-react-bits="Magnet">
      {children}
    </span>
  );
}
