import type { NextFunction, Request, Response } from 'express';

export type SecurityHeader = readonly [string, string];

function toWebSocketOrigin(origin: string): string {
  return origin.replace(/^http/, 'ws');
}

/**
 * The realtime service only serves JSON health checks and Socket.IO
 * transports, so the policy can stay strict: no inline or eval'd scripts and
 * no third-party realtime vendors. `connect-src` is derived from the same
 * allow-list used for CORS and the WebSocket handshake instead of hardcoded
 * domains, so previews, aliases and self-hosted deploys stay in sync.
 */
export function buildContentSecurityPolicy(
  allowedOrigins: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const connectSources = new Set<string>(["'self'"]);
  for (const origin of allowedOrigins) {
    connectSources.add(origin);
    connectSources.add(toWebSocketOrigin(origin));
  }

  const scriptSources = ["'self'"];
  const frameSources = ["'self'"];

  // The Vercel Live toolbar only exists on Vercel deployments.
  if (env.VERCEL) {
    connectSources.add('https://vercel.live');
    scriptSources.push('https://vercel.live');
    frameSources.push('https://vercel.live', 'https://*.vercel.live');
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${[...connectSources].join(' ')}`,
    `frame-src ${frameSources.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Security headers applied to every response. Vercel already injects HSTS at
 * the edge, but we set it again here so the headers are also visible on
 * non-Vercel deploys (e.g. local Docker, on-prem) and on the Socket.IO
 * long-poll transport. Keep this in sync with `vercel.json` and
 * `apps/web/next.config.ts`.
 */
export function buildSecurityHeaders(
  allowedOrigins: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ReadonlyArray<SecurityHeader> {
  return [
    [
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    ],
    ['X-Frame-Options', 'DENY'],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    [
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    ],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['Cross-Origin-Resource-Policy', 'same-origin'],
    ['X-DNS-Prefetch-Control', 'off'],
    ['X-Permitted-Cross-Domain-Policies', 'none'],
    [
      'Content-Security-Policy',
      buildContentSecurityPolicy(allowedOrigins, env),
    ],
  ];
}

export function createSecurityHeadersMiddleware(
  headers: ReadonlyArray<SecurityHeader>,
) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    for (const [key, value] of headers) {
      res.setHeader(key, value);
    }
    next();
  };
}
