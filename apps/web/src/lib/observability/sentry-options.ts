import type { ErrorEvent, Event } from '@sentry/nextjs';

type SentryEnvironment = Record<string, string | undefined>;
type TransactionEvent = Event & { type: 'transaction' };

const DEFAULT_TRACES_SAMPLE_RATE = 0.02;

function optionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function tracesSampleRate(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TRACES_SAMPLE_RATE;
  return Math.min(1, Math.max(0, parsed));
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    type: event.type,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    message: event.message ? 'Application error' : undefined,
    exception: event.exception?.values
      ? {
          values: event.exception.values.map(() => ({
            type: 'Error',
            value: '[redacted]',
          })),
        }
      : undefined,
  };
}

export function sanitizeSentryTransaction(event: TransactionEvent): TransactionEvent {
  const trace = event.contexts?.trace;
  return {
    type: 'transaction',
    event_id: event.event_id,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    transaction: 'web request',
    spans: [],
    contexts: trace
      ? {
          trace: {
            trace_id: trace.trace_id,
            span_id: trace.span_id,
            parent_span_id: trace.parent_span_id,
          },
        }
      : undefined,
  };
}

export function createSentryOptions(environment: SentryEnvironment) {
  const dsn = optionalValue(environment.NEXT_PUBLIC_SENTRY_DSN ?? environment.SENTRY_DSN);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment: optionalValue(
      environment.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
        environment.SENTRY_ENVIRONMENT ??
        environment.VERCEL_ENV ??
        environment.NODE_ENV,
    ),
    release: optionalValue(
      environment.NEXT_PUBLIC_SENTRY_RELEASE ??
        environment.SENTRY_RELEASE ??
        environment.VERCEL_GIT_COMMIT_SHA,
    ),
    beforeSend: sanitizeSentryEvent,
    beforeSendTransaction: sanitizeSentryTransaction,
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate(
      environment.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? environment.SENTRY_TRACES_SAMPLE_RATE,
    ),
  };
}
