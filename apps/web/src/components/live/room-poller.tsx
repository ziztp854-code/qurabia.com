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

    const tick = async () => {
      if (!active || document.visibilityState === 'hidden' || inFlightRequest.current) {
        return;
      }

      const controller = new AbortController();
      inFlightRequest.current = controller;
      const sentAt = Date.now();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ participantId, participantToken }),
        cache: 'no-store',
        signal: controller.signal,
      }).catch(() => null);
      if (inFlightRequest.current === controller) inFlightRequest.current = null;
      if (response?.ok) {
        let payload: { serverTime?: unknown } | null = null;
        try {
          payload = (await response.json()) as { serverTime?: unknown } | null;
        } catch {
          payload = null;
        }
        if (typeof payload?.serverTime === 'number') {
          const receivedAt = Date.now();
          const rtt = Math.max(0, receivedAt - sentAt);
          setDisplayClockOffset(payload.serverTime + rtt / 2 - receivedAt);
        }
      }
      const skipRefresh = isInitialTick.current;
      isInitialTick.current = false;
      if (!active || !response?.ok || skipRefresh) return;
      startTransition(() => router.refresh());
    };

    const timer = window.setInterval(tick, intervalMs);
    void tick();
    return () => {
      active = false;
      window.clearInterval(timer);
      inFlightRequest.current?.abort();
      inFlightRequest.current = null;
    };
  }, [endpoint, intervalMs, participantId, participantToken, router, startTransition]);

  return null;
}
