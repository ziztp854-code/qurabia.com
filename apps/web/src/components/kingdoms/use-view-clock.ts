'use client';

import { useEffect, useRef, useState } from 'react';

export function useViewClock(
  view: { serverNow: number; revision?: number; paused?: boolean },
  deadline: number,
  scope = '',
) {
  const snapshot = `${scope}:${view.revision ?? 0}:${view.serverNow}:${view.paused ? 1 : 0}`;
  const [clock, setClock] = useState({ snapshot, elapsed: 0 });
  const anchor = useRef<{ snapshot: string; startedAt: number } | null>(null);
  useEffect(() => {
    if (view.paused || deadline <= view.serverNow) return;
    if (anchor.current?.snapshot !== snapshot) {
      anchor.current = { snapshot, startedAt: performance.now() };
    }
    const startedAt = anchor.current.startedAt;
    const timer = setInterval(() => {
      const elapsed = Math.max(0, performance.now() - startedAt);
      setClock({ snapshot, elapsed: Math.min(elapsed, deadline - view.serverNow) });
      if (view.serverNow + elapsed >= deadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline, snapshot, view.paused, view.serverNow]);
  return view.serverNow + (!view.paused && clock.snapshot === snapshot ? clock.elapsed : 0);
}
