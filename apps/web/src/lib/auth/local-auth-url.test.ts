import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import GoogleProvider from 'next-auth/providers/google';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLocalAuthBaseUrl, resolveAuthBaseUrl } from './local-auth-url';

const require = createRequire(import.meta.url);
const { AuthHandler } = require(path.join(path.dirname(require.resolve('next-auth')), 'core/index.js'));

afterEach(() => vi.unstubAllEnvs());

describe('resolveAuthBaseUrl', () => {
  it('keeps production and Vercel URLs unchanged', () => {
    expect(
      resolveAuthBaseUrl({
        vercel: '1',
        nodeEnv: 'production',
        authUrl: 'https://qurabia.com',
        nextAuthUrl: 'https://qurabia.com',
      }),
    ).toBe('https://qurabia.com');
  });

  it('forces localhost when a production URL is loaded during local development', () => {
    expect(
      resolveAuthBaseUrl({
        nodeEnv: 'development',
        authUrl: 'https://qurabia.com',
        nextAuthUrl: 'https://qurabia.com',
      }),
    ).toBe('http://localhost:3000');
  });

  it('keeps an explicit localhost URL', () => {
    expect(
      resolveAuthBaseUrl({
        nodeEnv: 'development',
        nextAuthUrl: 'http://localhost:3000',
      }),
    ).toBe('http://localhost:3000');
  });
});

describe('AUTH_URL compatibility with the installed NextAuth callback', () => {
  function configure(authUrl?: string, nextAuthUrl?: string, vercel?: string) {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('VERCEL', vercel);
    vi.stubEnv('AUTH_URL', authUrl);
    vi.stubEnv('NEXTAUTH_URL', nextAuthUrl);
  }

  it.each([undefined, '1'])('uses explicit AUTH_URL for production callback (VERCEL=%s)', async (vercel) => {
    configure('https://qurabia.com', undefined, vercel);
    applyLocalAuthBaseUrl();

    const response = await AuthHandler({
      options: {
        secret: randomUUID(),
        providers: [GoogleProvider({ clientId: 'contract-id', clientSecret: 'contract-secret' })],
      },
      req: { action: 'providers', method: 'GET', headers: { host: 'preview.example.test' } },
    });

    expect(response.body.google.callbackUrl).toBe('https://qurabia.com/api/auth/callback/google');
    expect(process.env.NEXTAUTH_URL).toBe('https://qurabia.com');
  });

  it('preserves an explicitly configured NEXTAUTH_URL', () => {
    configure('https://qurabia.com', 'https://auth.example.test');
    applyLocalAuthBaseUrl();
    expect(process.env.NEXTAUTH_URL).toBe('https://auth.example.test');
    expect(process.env.AUTH_URL).toBe('https://qurabia.com');
  });

  it('does not configure a localhost fallback in production when both URLs are absent', () => {
    configure();
    applyLocalAuthBaseUrl();
    expect(process.env.NEXTAUTH_URL).toBeUndefined();
    expect(process.env.AUTH_URL).toBeUndefined();
  });
});
