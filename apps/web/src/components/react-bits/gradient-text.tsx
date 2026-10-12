'use client';

// Adapted from David Haz's React Bits GradientText. See THIRD_PARTY.md and LICENSE.md.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useMotionActivity } from '@/components/motion/use-motion-activity';
import styles from './react-bits.module.css';

/** Linear variant only; CSS replaces the original per-frame gradient painter. */
export function GradientText({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  useMotionActivity(rootRef);
  return (
    <span
      ref={rootRef}
      className={styles.gradientText}
      data-react-bits="GradientText"
      style={
        {
          '--gt-gradient':
            'linear-gradient(90deg, var(--home-ink, var(--foreground)), color-mix(in srgb, var(--home-ink, var(--foreground)) 86%, var(--primary)), var(--home-ink, var(--foreground)))',
        } as CSSProperties
      }
    >
      <span className={styles.gradientContent}>{children}</span>
    </span>
  );
}
