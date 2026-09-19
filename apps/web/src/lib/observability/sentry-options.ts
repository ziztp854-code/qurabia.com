import type { ErrorEvent } from '@sentry/nextjs';

type SentryEnvironment = Record<string, string | undefined>;

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

function redactSentryUrl(value: string | undefined) {
  if (!value) return value;

  return value
    .split(/[?#]/, 1)[0]
    .replace(/\/auth\/reset-password\/[^/]+/g, '/auth/reset-password/[redacted]')
    .replace(/\/join\/[^/]+/g, '/join/[redacted]')
    .replace(/\/live\/[^/]+\/play/g, '/live/[redacted]/play');
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    user: undefined,
    transaction: redactSentryUrl(event.transaction),
    request: event.request
      ? {
          ...event.request,
          cookies: undefined,
          data: undefined,
          headers: undefined,
          query_string: undefined,
          url: redactSentryUrl(event.request.url),
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
        environment.VERCEL_DEPLOYMENT_ID,
    ),
    beforeSend: sanitizeSentryEvent,
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate(
      environment.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? environment.SENTRY_TRACES_SAMPLE_RATE,
    ),
  };
}
