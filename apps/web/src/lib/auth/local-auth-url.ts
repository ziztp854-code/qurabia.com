const LOCAL_AUTH_URL = 'http://localhost:3000';

export function resolveAuthBaseUrl({
  vercel,
  nodeEnv,
  vitest,
  authUrl,
  nextAuthUrl,
  fallback = LOCAL_AUTH_URL,
}: {
  vercel?: string;
  nodeEnv?: string;
  vitest?: string;
  authUrl?: string;
  nextAuthUrl?: string;
  fallback?: string;
}) {
  if (vercel || nodeEnv === 'production' || vitest || nodeEnv === 'test') {
    return nextAuthUrl || authUrl || fallback;
  }

  const current = nextAuthUrl || authUrl || '';
  if (!current || /qurabia\.com/i.test(current) || current.startsWith('https://')) {
    return fallback;
  }
  return current.replace(/\/$/, '');
}

export function applyLocalAuthBaseUrl() {
  const url = resolveAuthBaseUrl({
    vercel: process.env.VERCEL,
    nodeEnv: process.env.NODE_ENV,
    vitest: process.env.VITEST,
    authUrl: process.env.AUTH_URL,
    nextAuthUrl: process.env.NEXTAUTH_URL,
  });

  if (!process.env.VERCEL && process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    process.env.NEXTAUTH_URL = url;
    process.env.AUTH_URL = url;
  }

  return url;
}
