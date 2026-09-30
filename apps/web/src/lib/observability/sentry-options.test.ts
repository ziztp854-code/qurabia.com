import { describe, expect, it } from 'vitest';
import {
  createSentryOptions,
  sanitizeSentryEvent,
  sanitizeSentryTransaction,
} from './sentry-options';

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
        NEXT_PUBLIC_SENTRY_DSN: 'configured-dsn',
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
        NEXT_PUBLIC_SENTRY_DSN: 'configured-dsn',
        SENTRY_TRACES_SAMPLE_RATE: 'not-a-number',
      }).tracesSampleRate,
    ).toBe(0.02);
  });

  it('removes secrets and personal data before sending an event', () => {
    const event = sanitizeSentryEvent({
      type: undefined,
      user: { email: 'player@example.com' },
      transaction: '/auth/reset-password/private-token',
      request: {
        url: 'https://qurabia.com/join/ABC123?token=secret',
          headers: { 'x-private-header': 'private value' },
          query_string: 'personal=private',
          cookies: { browserState: 'private' },
        data: { participantId: 'private' },
      },
    });
    expect(event.user).toBeUndefined();
    expect(event.transaction).toBeUndefined();
    expect(event.request).toBeUndefined();
  });

  it('does not send raw exception content or attached context', () => {
    const event = sanitizeSentryEvent({
      type: undefined,
      event_id: 'event-123',
      message: 'private connection string',
      exception: {
        values: [
          {
            type: 'privateSecretName',
            value: 'private connection string',
            stacktrace: { frames: [{ filename: 'private connection string' }] },
          },
        ],
      },
      breadcrumbs: [{ message: 'private connection string' }],
      extra: { privateData: 'private connection string' },
      contexts: { secret: { value: 'private connection string' } },
    });

    expect(event.event_id).toBe('event-123');
    expect(event.exception?.values?.[0]?.type).toBe('Error');
    expect(JSON.stringify(event)).not.toContain('private connection string');
    expect(JSON.stringify(event)).not.toContain('privateSecretName');
  });

  it('removes room links and span details from performance transactions', () => {
    const event = sanitizeSentryTransaction({
      type: 'transaction',
      transaction: '/join/private-room-code',
      spans: [{ description: 'private-room-code' }],
      request: { url: 'https://qurabia.com/join/private-room-code' },
      contexts: { trace: { trace_id: 'trace-123', span_id: 'span-123', op: 'private-room-code' } },
    } as unknown as Parameters<typeof sanitizeSentryTransaction>[0]);

    expect(event.transaction).toBe('web request');
    expect(JSON.stringify(event)).not.toContain('private-room-code');
  });
});
