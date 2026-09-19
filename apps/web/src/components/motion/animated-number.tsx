'use client';

import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { motionDurations } from '@/lib/motion';
import { formatNumber } from '@/lib/utils';

export function AnimatedNumber({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const previousValue = useRef(value);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const from = previousValue.current;
    previousValue.current = value;
    if (reduceMotion || from === value) {
      setDisplayValue(value);
      return;
    }

    const startedAt = performance.now();
    const duration = motionDurations.normal * 1_000;
    let frame = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setDisplayValue(Math.round(from + (value - from) * progress));
      if (progress < 1) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [reduceMotion, value]);

  return (
    <span className={className} aria-label={label} aria-live={label ? 'polite' : undefined}>
      {formatNumber(displayValue)}
    </span>
  );
}
