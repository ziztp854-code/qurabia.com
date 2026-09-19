import * as Sentry from '@sentry/nestjs';
import type { ErrorEvent } from '@sentry/nestjs';

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
    .replace(
      /\/auth\/reset-password\/[^/]+/g,
      '/auth/reset-password/[redacted]',
    )
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
  const dsn = optionalValue(environment.SENTRY_DSN);

  return {
    dsn,
    enabled: Boolean(dsn),
    environment: optionalValue(
      environment.SENTRY_ENVIRONMENT ??
        environment.VERCEL_ENV ??
        environment.NODE_ENV,
    ),
    release: optionalValue(
      environment.SENTRY_RELEASE ?? environment.VERCEL_DEPLOYMENT_ID,
    ),
    beforeSend: sanitizeSentryEvent,
    sendDefaultPii: false,
    tracesSampleRate: tracesSampleRate(environment.SENTRY_TRACES_SAMPLE_RATE),
  };
}

const options = createSentryOptions(process.env);

export function initSentry() {
  if (options.enabled) Sentry.init(options);
}

export function isSentryEnabled() {
  return options.enabled;
}

export function captureException(error: unknown) {
  if (options.enabled) Sentry.captureException(error);
}

export async function flushSentry(timeout = 2_000) {
  if (options.enabled) await Sentry.flush(timeout);
}
