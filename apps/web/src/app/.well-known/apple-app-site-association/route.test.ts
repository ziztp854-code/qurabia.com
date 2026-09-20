import { afterEach, describe, expect, it } from 'vitest';
import { buildAppleAppSiteAssociation, GET } from './route';

const originalTeamId = process.env.APPLE_TEAM_ID;

afterEach(() => {
  if (originalTeamId === undefined) delete process.env.APPLE_TEAM_ID;
  else process.env.APPLE_TEAM_ID = originalTeamId;
});

describe('GET /.well-known/apple-app-site-association', () => {
  it('fails closed and without caching when the Apple Team ID is absent', async () => {
    delete process.env.APPLE_TEAM_ID;

    const response = GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'APPLE_APP_SITE_ASSOCIATION_NOT_CONFIGURED',
    });
  });

  it('rejects malformed identifiers instead of publishing an unusable association', () => {
    expect(buildAppleAppSiteAssociation('replace-me')).toBeNull();
    expect(buildAppleAppSiteAssociation('ABC123')).toBeNull();
    expect(buildAppleAppSiteAssociation('abcdefghij')).toBeNull();
  });

  it('publishes only the approved join path for the fixed iOS bundle', async () => {
    process.env.APPLE_TEAM_ID = 'A1B2C3D4E5';

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toContain('s-maxage=3600');
    await expect(response.json()).resolves.toEqual({
      applinks: {
        apps: [],
        details: [
          {
            appID: 'A1B2C3D4E5.com.qurabia.tahaddi',
            paths: ['/join/*'],
          },
        ],
      },
    });
  });
});
