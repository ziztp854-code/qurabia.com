import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecentSentryIssues } from './monitor-errors';

describe('getRecentSentryIssues', () => {
  beforeEach(() => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'test-token');
    vi.stubEnv('SENTRY_ORG_SLUG', 'test-org');
    vi.stubEnv('SENTRY_PROJECT_SLUG', 'test-web');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => vi.unstubAllEnvs());

  it('reads a small list of recent unresolved issues without exposing the token', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: '7',
          shortId: 'WEB-7',
          title: 'Request failed',
          lastSeen: '2026-09-27T08:00:00Z',
          permalink: 'https://sentry.io/issues/7/',
        },
      ],
    } as Response);

    const result = await getRecentSentryIssues();

    expect(result).toEqual({
      status: 'available',
      issues: [
        {
          id: '7',
          code: 'WEB-7',
          lastSeen: '2026-09-27T08:00:00Z',
          url: 'https://sentry.io/issues/7/',
        },
      ],
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://sentry.io/api/0/organizations/test-org/issues/?project=test-web&query=is%3Aunresolved&sort=date&limit=5',
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    );
    expect(JSON.stringify(result)).not.toContain('test-token');
    expect(JSON.stringify(result)).not.toContain('Request failed');
  });

  it('distinguishes missing credentials and provider failures', async () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', '');
    await expect(getRecentSentryIssues()).resolves.toEqual({ status: 'unconfigured', issues: [] });

    vi.stubEnv('SENTRY_AUTH_TOKEN', 'test-token');
    vi.mocked(fetch).mockRejectedValue(new Error('provider unavailable'));
    await expect(getRecentSentryIssues()).resolves.toEqual({ status: 'unavailable', issues: [] });
  });
});
