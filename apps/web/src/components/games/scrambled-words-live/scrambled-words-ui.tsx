'use client';

import type { CSSProperties } from 'react';
import { Crown } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import styles from './scrambled-words-room.module.css';

const RING_CIRCUMFERENCE = 2 * Math.PI * 26;

export function TimerRing({
  fraction,
  label,
}: {
  fraction: number | null;
  label: string;
}) {
  const clamped = fraction == null ? null : Math.min(1, Math.max(0, fraction));
  const state =
    clamped == null ? 'idle' : clamped > 0.5 ? 'calm' : clamped > 0.2 ? 'warn' : 'danger';
  return (
    <span className={styles.swlTimerRing} data-state={state}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.swlTimerTrack} cx="32" cy="32" r="26" />
        <circle
          className={styles.swlTimerArc}
          cx="32"
          cy="32"
          r="26"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={clamped == null ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - clamped)}
        />
      </svg>
      <b className={styles.swlTimerLabel} dir="ltr" aria-live="off">
        {label}
      </b>
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  const hue =
    [...name.trim()].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
  return (
    <span
      className={styles.swlAvatar}
      style={{ '--avatar-hue': hue } as CSSProperties}
      aria-hidden="true"
    >
      {name.trim().charAt(0) || '؟'}
    </span>
  );
}

export function ProgressDots({
  total,
  solved,
}: {
  total: number;
  solved: number;
}) {
  return (
    <div
      className={styles.swlProgressDots}
      role="status"
      aria-label={`أكملت ${formatNumber(solved)} من ${formatNumber(total)} كلمات`}
    >
      {Array.from({ length: total }, (_, index) => (
        <i key={index} data-done={index < solved || undefined} />
      ))}
      <b dir="ltr">
        {formatNumber(solved)} / {formatNumber(total)}
      </b>
    </div>
  );
}

export function FastestBadge() {
  return (
    <div className={styles.swlFastest} role="status">
      <Crown aria-hidden="true" size={18} />
      <b>الأسرع</b>
      <span>أول لاعب يكمل جميع الكلمات يفوز</span>
    </div>
  );
}
