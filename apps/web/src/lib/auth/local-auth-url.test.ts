import { describe, expect, it } from 'vitest';
import { resolveAuthBaseUrl } from './local-auth-url';

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
