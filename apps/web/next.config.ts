import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || value === '') continue;
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  loadEnvFile(path.resolve(process.cwd(), '../../.env'));
}

const isProduction = process.env.NODE_ENV === 'production';
const onVercel = Boolean(process.env.VERCEL);

function toOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin: string): string {
  return origin.replace(/^http/, 'ws');
}

/**
 * Content-Security-Policy for the web app. Keep in sync with the policy in
 * `vercel.json`, which is what Vercel serves; this function covers every
 * other host (Render, Docker, on-prem) so a deployment never ships without
 * a CSP.
 *
 *  - `connect-src` is derived from NEXT_PUBLIC_REALTIME_URL and
 *    NEXT_PUBLIC_SITE_URL (https + wss twins) instead of hardcoded domains.
 *  - Next.js injects inline bootstrap scripts, so `'unsafe-inline'` stays
 *    until a nonce-based policy is introduced.
 *  - `'wasm-unsafe-eval'` covers the Draco/KTX2 decoders used by the 3D
 *    scenes; `'unsafe-eval'` is never allowed in production.
 *  - `worker-src blob:` is required by the three.js loader workers.
 */
function buildContentSecurityPolicy(): string {
  const connectSources = new Set(["'self'"]);
  for (const origin of [
    toOrigin(process.env.NEXT_PUBLIC_REALTIME_URL),
    toOrigin(process.env.NEXT_PUBLIC_SITE_URL),
  ]) {
    if (!origin) continue;
    connectSources.add(origin);
    connectSources.add(toWebSocketOrigin(origin));
  }

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${[...connectSources].join(' ')}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(toOrigin(process.env.NEXT_PUBLIC_SITE_URL)?.startsWith('http://')
      ? []
      : ['upgrade-insecure-requests']),
  ].join('; ');
}

/**
 * Security headers applied to every response.
 *  - HSTS (2 years) with subdomains and preload.
 *  - X-Frame-Options DENY: block clickjacking on every route.
 *  - X-Content-Type-Options nosniff: block MIME sniffing.
 *  - Referrer-Policy strict-origin-when-cross-origin: sane default.
 *  - Permissions-Policy: disable powerful APIs we do not need.
 *  - COOP / DNS prefetch / cross-domain policies: match `vercel.json`.
 *  - CSP: only emitted on production builds that do not run on Vercel
 *    (Vercel already injects it from `vercel.json`; emitting it twice would
 *    enforce the intersection of both policies).
 */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ...(isProduction && !onVercel
    ? [{ key: 'Content-Security-Policy', value: buildContentSecurityPolicy() }]
    : []),
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  trailingSlash: true,
  experimental: {
    prefetchInlining: true,
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
      {
        source: '/models/:asset(.*\\.[a-f0-9]{16}\\.glb)',
        headers: [
          {
            key: 'Cache-Control',
            value: isProduction ? 'public, max-age=31536000, immutable' : 'no-store',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const key = process.env.INDEXNOW_KEY?.trim();
    if (!key) return [];
    return [{ source: `/${key}.txt`, destination: '/api/indexnow-key' }];
  },
  turbopack: {
    root: path.resolve(process.cwd(), '../..'),
  },
};

export default withWorkflow(nextConfig);
