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

  it.each(['*', 'null', 'https://play.example.com/path'])(
    'rejects an unsafe WEB_ORIGIN value: %s',
    (WEB_ORIGIN) => {
      expect(() =>
        validateEnvironment({ ...baseEnvironment, WEB_ORIGIN }),
      ).toThrow();
    },
  );
});
