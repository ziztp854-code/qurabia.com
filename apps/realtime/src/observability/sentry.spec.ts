import { createSentryOptions, sanitizeSentryEvent } from './sentry';

describe('realtime Sentry options', () => {
  it('does not send telemetry without an explicit DSN', () => {
    expect(createSentryOptions({})).toMatchObject({
      dsn: undefined,
      enabled: false,
      sendDefaultPii: false,
    });
  });

  it('uses a low default trace rate and clamps configured values', () => {
    expect(
      createSentryOptions({
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/2',
      }),
    ).toMatchObject({ enabled: true, tracesSampleRate: 0.02 });

    expect(
      createSentryOptions({
        SENTRY_DSN: 'https://public@example.ingest.sentry.io/2',
        SENTRY_TRACES_SAMPLE_RATE: '-3',
      }).tracesSampleRate,
    ).toBe(0);
  });

  it('scrubs request credentials and room identifiers', () => {
    expect(
      sanitizeSentryEvent({
        type: undefined,
        user: { id: 'participant-1' },
        request: {
          url: 'https://qurabia.com/live/session-secret/play?token=secret',
          headers: { cookie: 'session=secret' },
          query_string: 'token=secret',
        },
      }),
    ).toMatchObject({
      user: undefined,
      request: {
        url: 'https://qurabia.com/live/[redacted]/play',
        headers: undefined,
        query_string: undefined,
      },
    });
  });
});
