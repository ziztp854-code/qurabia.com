'use client';

import { useEffect, type RefObject } from 'react';

/** Progressive enhancement: CSS stays still until visible, hydrated and permitted. */
export function useMotionActivity(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const update = () => {
      element.dataset.motionActive = String(visible && !document.hidden && !preference.matches);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      delete element.dataset.motionActive;
    };
  }, [ref]);
}
