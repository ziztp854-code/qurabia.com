'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { supportsSmoothScroll } from './scroll-policy';
import { loadScrollRuntime } from './load-scroll-runtime';

export function ScrollEnhancement() {
  const pathname = usePathname();
  useEffect(() => {
    if (!supportsSmoothScroll(pathname)) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let generation = 0;
    let cleanup: (() => void) | undefined;
    const sync = () => {
      const current = ++generation;
      cleanup?.();
      cleanup = undefined;
      if (preference.matches) return;
      // No GSAP/Lenis on SSR, disabled motion or game routes. Cancel stale imports.
      void loadScrollRuntime()
        .then(({ startScrollRuntime }) => {
          if (generation !== current) return;
          cleanup = startScrollRuntime(document.documentElement);
        })
        .catch((error: unknown) => {
          if (process.env.NODE_ENV !== 'production')
            console.warn('Scroll enhancement unavailable; using native scrolling.', error);
        });
    };
    preference.addEventListener('change', sync);
    sync();
    return () => {
      ++generation;
      preference.removeEventListener('change', sync);
      cleanup?.();
    };
  }, [pathname]);
  return null;
}
