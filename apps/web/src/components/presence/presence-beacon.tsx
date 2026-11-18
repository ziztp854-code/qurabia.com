'use client';

import { useEffect } from 'react';

const STORAGE_KEY = 'tahaddi-visitor-id';
const HEARTBEAT_KEY = 'tahaddi-presence-last-heartbeat';
const HEARTBEAT_MS = 40_000;
let lastHeartbeatAt = Number.NEGATIVE_INFINITY;
let fallbackVisitorId: string | undefined;

function visitorId() {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && /^[0-9a-f-]{8,64}$/i.test(existing)) return existing;
    const next = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return (fallbackVisitorId ??= crypto.randomUUID());
  }
}

function reserveHeartbeat() {
  const now = Date.now();
  const isRecent = (sentAt: number) => sentAt <= now && now - sentAt < HEARTBEAT_MS;
  if (isRecent(lastHeartbeatAt)) return false;

  try {
    const sharedTimestamp = localStorage.getItem(HEARTBEAT_KEY);
    if (sharedTimestamp !== null && isRecent(Number(sharedTimestamp))) return false;
    localStorage.setItem(HEARTBEAT_KEY, String(now));
  } catch {
    // Keep throttling in this document when storage is unavailable.
  }

  lastHeartbeatAt = now;
  return true;
}

export function PresenceBeacon() {
  useEffect(() => {
    let mounted = true;
    const sendHeartbeat = () => {
      if (!mounted || document.hidden || !reserveHeartbeat()) return;
      void fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: visitorId() }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const ping = () => {
      if (document.hidden) return;
      if (navigator.locks) {
        // Serialize the timestamp update when several tabs wake at once.
        void navigator.locks.request(HEARTBEAT_KEY, sendHeartbeat).catch(sendHeartbeat);
      } else {
        sendHeartbeat();
      }
    };

    ping();
    const timer = window.setInterval(ping, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', ping);
    };
  }, []);

  return null;
}
