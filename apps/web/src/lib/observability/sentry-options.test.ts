import { describe, expect, it } from 'vitest';
import { createSentryOptions, sanitizeSentryEvent } from './sentry-options';

describe('web Sentry options', () => {
  it('stays disabled when no DSN is configured', () => {
    expect(createSentryOptions({})).toMatchObject({
      dsn: undefined,
      enabled: false,
      sendDefaultPii: false,
    });
  });

  it('uses conservative tracing and clamps invalid sample rates', () => {
    expect(
      createSentryOptions({
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
        SENTRY_TRACES_SAMPLE_RATE: '4',
        SENTRY_ENVIRONMENT: 'preview',
        SENTRY_RELEASE: 'release-42',
      }),
    ).toMatchObject({
      enabled: true,
      tracesSampleRate: 1,
      environment: 'preview',
      release: 'release-42',
      sendDefaultPii: false,
    });

    expect(
      createSentryOptions({
        NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
        SENTRY_TRACES_SAMPLE_RATE: 'not-a-number',
      }).tracesSampleRate,
    ).toBe(0.02);
  });

  it('removes secrets and personal data before sending an event', () => {
    expect(
      sanitizeSentryEvent({
        type: undefined,
        user: { email: 'player@example.com' },
        transaction: '/auth/reset-password/private-token',
        request: {
          url: 'https://qurabia.com/join/ABC123?token=secret',
          headers: { authorization: 'Bearer secret' },
          query_string: 'token=secret',
          cookies: { session: 'secret' },
          data: { participantId: 'private' },
        },
      }),
    ).toMatchObject({
      user: undefined,
      transaction: '/auth/reset-password/[redacted]',
      request: {
        url: 'https://qurabia.com/join/[redacted]',
        headers: undefined,
        query_string: undefined,
        cookies: undefined,
        data: undefined,
      },
    });
  });
});
