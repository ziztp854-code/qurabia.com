'use client';

import { MotionConfig, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { type ReactNode, useLayoutEffect } from 'react';
import { getRouteEntranceMotion } from '@/lib/motion';

function RouteEntranceObserver() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const entrance = getRouteEntranceMotion(Boolean(reduceMotion));
    const content = document.querySelector('main');
    if (!content || !entrance || typeof content.animate !== 'function') return;

    const animation = content.animate(entrance.keyframes, entrance.options);
    return () => animation.cancel();
  }, [pathname, reduceMotion]);

  return null;
}

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <RouteEntranceObserver />
      {children}
    </MotionConfig>
  );
}
