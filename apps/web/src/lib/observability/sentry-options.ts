import type { ErrorEvent, Event, StackFrame } from '@sentry/nextjs';

type SentryEnvironment = Record<string, string | undefined>;
type TransactionEvent = Event & { type: 'transaction' };

const DEFAULT_TRACES_SAMPLE_RATE = 0.02;
const ERROR_CODES: Record<string, string> = {
  Error: 'WEB_ERROR',
  TypeError: 'WEB_TYPE_ERROR',
  ReferenceError: 'WEB_REFERENCE_ERROR',
  RangeError: 'WEB_RANGE_ERROR',
  SyntaxError: 'WEB_SYNTAX_ERROR',
  URIError: 'WEB_URI_ERROR',
  EvalError: 'WEB_EVAL_ERROR',
  AggregateError: 'WEB_AGGREGATE_ERROR',
};

function sanitizeFrame(frame: StackFrame): StackFrame | undefined {
  // Keep only compiled application locations. Never send origins, query strings,
  // function names, source context, local variables, or arbitrary file paths.
  const filename = frame.filename?.split(/[?#]/, 1)[0];
  const match = filename?.match(
    /(?:^|\/)((?:_next\/static|\.next\/server)\/(?:[A-Za-z0-9_@()[\].-]+\/)*[A-Za-z0-9_@()[\].-]+\.(?:js|mjs))$/,
  );
  if (!match || match[1].split('/').includes('..')) return undefined;
  return {
    filename: match[1].startsWith('_next/') ? `/${match[1]}` : `app:///${match[1]}`,
    lineno: Number.isSafeInteger(frame.lineno) && frame.lineno! > 0 ? frame.lineno : undefined,
    colno: Number.isSafeInteger(frame.colno) && frame.colno! >= 0 ? frame.colno : undefined,
    in_app: true,
  };
}

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
          values: event.exception.values.map((exception) => {
            const knownType = exception.type && Object.hasOwn(ERROR_CODES, exception.type);
            const type = knownType ? exception.type! : 'Error';
            const frames = exception.stacktrace?.frames
              ?.map(sanitizeFrame)
              .filter((frame): frame is StackFrame => Boolean(frame));
            return {
              type,
              value: ERROR_CODES[type],
              stacktrace: frames?.length ? { frames } : undefined,
            };
          }),
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
