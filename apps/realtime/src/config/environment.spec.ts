import { validateEnvironment } from './environment.js';

const baseEnvironment = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/tahaddi',
  AUTH_SECRET: 'test-only-auth-secret-32-characters',
};

describe('validateEnvironment', () => {
  it('accepts a comma-separated list of exact web origins', () => {
    expect(
      validateEnvironment({
        ...baseEnvironment,
        WEB_ORIGIN: 'https://play.example.com,https://admin.example.com',
      }).WEB_ORIGIN,
    ).toBe('https://play.example.com,https://admin.example.com');
  });

  it('accepts an optional dedicated device hash secret', () => {
    expect(
      validateEnvironment({
        ...baseEnvironment,
        LIVE_DEVICE_HASH_SECRET: 'device-hash-secret-with-32-characters',
      }).LIVE_DEVICE_HASH_SECRET,
    ).toBe('device-hash-secret-with-32-characters');
  });

  it('rejects a weak device hash secret when one is provided', () => {
    expect(() =>
      validateEnvironment({
        ...baseEnvironment,
        LIVE_DEVICE_HASH_SECRET: 'too-short',
      }),
    ).toThrow();
  });

  it.each(['*', 'null', 'https://play.example.com/path'])(
    'rejects an unsafe WEB_ORIGIN value: %s',
    (WEB_ORIGIN) => {
      expect(() =>
        validateEnvironment({ ...baseEnvironment, WEB_ORIGIN }),
      ).toThrow();
    },
  );
});
