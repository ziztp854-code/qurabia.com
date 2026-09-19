'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'tahaddi-visitor-id';
const HEARTBEAT_MS = 40_000;

function visitorId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[0-9a-f-]{8,64}$/i.test(existing)) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export function PresenceBeacon() {
  useEffect(() => {
    const id = visitorId();
    const ping = () => {
      if (document.hidden) return;
      void fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: id }),
        keepalive: true,
      }).catch(() => undefined);
    };

    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);

  return null;
}
