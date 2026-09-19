'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export function Reveal({
  children,
  className,
  eager = false,
}: {
  children: ReactNode;
  className?: string;
  eager?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const visible = { opacity: 1, y: 0 };

  return (
    <motion.div
      className={className}
      initial={eager || reduceMotion ? visible : { opacity: 0, y: 28 }}
      animate={eager ? visible : undefined}
      whileInView={eager ? undefined : visible}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: reduceMotion ? 0 : 0.55, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
