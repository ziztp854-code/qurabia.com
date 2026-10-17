import { describe, expect, it } from 'vitest';
import { resolveSentryBuildRelease } from './sentry-release';

describe('build release shared by browser and server', () => {
  it('uses an explicit release, skipping blank public values', () => {
    expect(
      resolveSentryBuildRelease(
        { NEXT_PUBLIC_SENTRY_RELEASE: ' release-42 ', SENTRY_RELEASE: 'other' },
        'fallback',
      ),
    ).toBe('release-42');
    expect(
      resolveSentryBuildRelease(
        { NEXT_PUBLIC_SENTRY_RELEASE: ' ', SENTRY_RELEASE: 'server-release' },
        'fallback',
      ),
    ).toBe('server-release');
  });

  it.each(['VERCEL_GIT_COMMIT_SHA', 'RENDER_GIT_COMMIT', 'GITHUB_SHA'])(
    'uses %s as the revision',
    (key) => {
      const commit = 'a'.repeat(40);
      expect(resolveSentryBuildRelease({ [key]: commit }, 'fallback')).toBe(
        `qurabia-web@${commit}`,
      );
    },
  );

  it('falls back to the build revision when provider metadata is missing or invalid', () => {
    expect(resolveSentryBuildRelease({}, 'local-revision')).toBe('qurabia-web@local-revision');
    expect(resolveSentryBuildRelease({ VERCEL_GIT_COMMIT_SHA: 'invalid' }, 'build-id')).toBe(
      'qurabia-web@build-id',
    );
  });
});
