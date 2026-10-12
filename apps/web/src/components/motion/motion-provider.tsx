'use client';

import { MotionConfig, useReducedMotion } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { type ReactNode, useLayoutEffect } from 'react';
import { getRouteEntranceMotion } from '@/lib/motion';
import { ScrollEnhancement } from './scroll-enhancement';
import { supportsSmoothScroll } from './scroll-policy';

function RouteEntranceObserver() {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    // Keep the homepage's text contrast intact while hydration runs.
    // Fading the entire main element also fades its foreground against the page background.
    if (supportsSmoothScroll(pathname)) return;
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
      <ScrollEnhancement />
      {children}
    </MotionConfig>
  );
}
