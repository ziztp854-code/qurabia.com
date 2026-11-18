function toOrigin(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin) {
  return origin.replace(/^http/, 'ws');
}

export function buildWebContentSecurityPolicy(env = process.env) {
  const connectSources = new Set([
    "'self'",
    'https://tiles.openfreemap.org',
    'https://elevation-tiles-prod.s3.amazonaws.com',
  ]);
  for (const origin of [
    toOrigin(env.NEXT_PUBLIC_REALTIME_URL),
    toOrigin(env.NEXT_PUBLIC_SITE_URL),
    toOrigin(env.NEXT_PUBLIC_SENTRY_DSN),
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
    ...(toOrigin(env.NEXT_PUBLIC_SITE_URL)?.startsWith('http://')
      ? []
      : ['upgrade-insecure-requests']),
  ].join('; ');
}

export function buildWebSecurityHeaders(env = process.env) {
  return [
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(self), speaker-selection=(self), geolocation=(), interest-cohort=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ...(env.NODE_ENV === 'production'
      ? [{ key: 'Content-Security-Policy', value: buildWebContentSecurityPolicy(env) }]
      : []),
  ];
}

export const embeddedGameSecurityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), speaker-selection=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'",
  },
];
