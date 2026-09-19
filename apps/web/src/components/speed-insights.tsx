'use client';

import { SpeedInsights as VercelSpeedInsights } from '@vercel/speed-insights/next';

export function SpeedInsights() {
  return (
    <VercelSpeedInsights
      beforeSend={(event) => {
        if (typeof navigator !== 'undefined' && navigator.webdriver) return null;
        if (typeof window !== 'undefined') {
          const host = window.location.hostname;
          if (host === 'localhost' || host === '127.0.0.1') return null;
          if (host.includes('realtime')) return null;
        }
        return event;
      }}
    />
  );
}
