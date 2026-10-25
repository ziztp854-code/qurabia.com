'use client';

import { useEffect, useState } from 'react';

/** User preference can reduce motion; it can never override the OS preference. */
export function useRoomEffects() {
  const [light, setLight] = useState(false);
  const [system, setSystem] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () =>
      setSystem(
        media.matches || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2),
      );
    media.addEventListener('change', update);
    const frame = requestAnimationFrame(() => {
      update();
      try {
        setLight(localStorage.getItem('voice-light-effects') === 'true');
      } catch {
        /* optional preference */
      }
    });
    const controller = new AbortController();
    void fetch('/api/community/me', { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!controller.signal.aborted && result?.data?.settings?.reduceEffects) {
          try {
            if (localStorage.getItem('voice-light-effects') !== null) return;
          } catch {
            /* optional preference */
          }
          setLight(true);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
      media.removeEventListener('change', update);
    };
  }, []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    try {
      localStorage.setItem('voice-light-effects', String(next));
    } catch {
      /* session still works */
    }
  };
  return { reduced: light || system, light, toggle };
}
