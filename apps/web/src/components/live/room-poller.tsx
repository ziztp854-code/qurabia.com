'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';
import { setDisplayClockOffset } from './display-clock';

export function RoomPoller({
  endpoint,
  participantId,
  participantToken,
  intervalMs = 2_000,
}: {
  endpoint: string;
  participantId?: string;
  participantToken?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const inFlightRequest = useRef<AbortController | null>(null);
  const isInitialTick = useRef(true);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    isInitialTick.current = true;

    let bestRtt = Number.POSITIVE_INFINITY;
    const tick = async (forceRefresh = false) => {
      if (!active || document.visibilityState === 'hidden' || inFlightRequest.current) return;

      const controller = new AbortController();
      const skipRefresh = isInitialTick.current && !forceRefresh;
      isInitialTick.current = false;
      inFlightRequest.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 5_000);
      controller.signal.addEventListener('abort', () => window.clearTimeout(timeout), {
        once: true,
      });
      const sentAt = Date.now();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ participantId, participantToken }),
          cache: 'no-store',
          signal: controller.signal,
        }).catch(() => null);
        let payload: { serverTime?: unknown } | null = null;
        if (response?.ok) {
          try {
            payload = (await response.json()) as { serverTime?: unknown } | null;
          } catch {
            payload = null;
          }
        }
        // A previous room's delayed response must never change the current clock.
        if (!active || controller.signal.aborted) return;
        if (typeof payload?.serverTime === 'number' && Number.isFinite(payload.serverTime)) {
          const receivedAt = Date.now();
          const rtt = Math.max(0, receivedAt - sentAt);
          // Prefer the least delayed sample, as the socket clock does.
          if (rtt <= bestRtt) {
            bestRtt = rtt;
            setDisplayClockOffset(payload.serverTime + rtt / 2 - receivedAt);
          }
        }
        if (response?.ok && !skipRefresh) startTransition(() => router.refresh());
      } finally {
        window.clearTimeout(timeout);
        if (inFlightRequest.current === controller) inFlightRequest.current = null;
      }
    };

    const resume = () => {
      void tick(true);
    };
    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    void tick();
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      inFlightRequest.current?.abort();
      inFlightRequest.current = null;
    };
  }, [endpoint, intervalMs, participantId, participantToken, router, startTransition]);

  return null;
}
