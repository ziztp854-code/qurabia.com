import {
  isLiveConnectionTicket,
  LIVE_TICKET_HEADERS,
  verifyLiveAccessToken,
  type LiveConnectionTicket,
} from '@tahaddi/contracts';

const LOCAL_WEB_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3100',
];

function normalizeHttpOrigin(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isValidWebOriginList(value: string) {
  const origins = value.split(',').map((origin) => origin.trim());
  return (
    origins.length > 0 &&
    origins.every(
      (origin) => Boolean(origin) && normalizeHttpOrigin(origin) !== null,
    )
  );
}

function toHttpsOrigin(hostname: string | undefined) {
  const normalized = hostname?.trim();
  return normalized ? normalizeHttpOrigin(`https://${normalized}`) : null;
}

export function getAllowedWebOrigins() {
  const configuredOrigins = (process.env.WEB_ORIGIN ?? '')
    .split(',')
    .map((origin) => normalizeHttpOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
  const localDevelopmentOrigins =
    process.env.NODE_ENV === 'production' ? [] : LOCAL_WEB_ORIGINS;

  return [
    ...new Set(
      [
        ...configuredOrigins,
        normalizeHttpOrigin(process.env.AUTH_URL),
        normalizeHttpOrigin(process.env.NEXTAUTH_URL),
        normalizeHttpOrigin(process.env.NEXT_PUBLIC_SITE_URL),
        toHttpsOrigin(process.env.VERCEL_URL),
        toHttpsOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
        ...localDevelopmentOrigins,
      ].filter((origin): origin is string => Boolean(origin)),
    ),
  ];
}

export function isAllowedWebSocketOrigin(origin: string | undefined) {
  if (!origin) return process.env.NODE_ENV !== 'production';
  const normalizedOrigin = normalizeHttpOrigin(origin);
  return Boolean(
    normalizedOrigin && getAllowedWebOrigins().includes(normalizedOrigin),
  );
}

export function allowWebSocketOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void,
) {
  callback(null, isAllowedWebSocketOrigin(origin));
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type WebSocketHeaders = Record<string, string | string[] | undefined>;

function numericHeader(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function readNativeLiveTicket(
  headers: WebSocketHeaders,
  secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '',
): LiveConnectionTicket | null {
  const role = firstHeader(headers[LIVE_TICKET_HEADERS.role]);
  const expiresAt = numericHeader(
    firstHeader(headers[LIVE_TICKET_HEADERS.expiresAt]),
  );
  const subjectVersionValue = firstHeader(
    headers[LIVE_TICKET_HEADERS.subjectVersion],
  );
  const subjectVersion = subjectVersionValue
    ? numericHeader(subjectVersionValue)
    : undefined;
  const ticket = {
    sessionId: firstHeader(headers[LIVE_TICKET_HEADERS.sessionId]) ?? '',
    subjectId: firstHeader(headers[LIVE_TICKET_HEADERS.subjectId]) ?? '',
    role,
    accessToken: firstHeader(headers[LIVE_TICKET_HEADERS.accessToken]) ?? '',
    expiresAt,
    ...(subjectVersion === undefined ? {} : { subjectVersion }),
  };
  if (!isLiveConnectionTicket(ticket)) return null;
  return verifyLiveAccessToken(secret, {
    ...ticket,
    token: ticket.accessToken,
  })
    ? ticket
    : null;
}

/**
 * The realtime service is served from the same deployment as the web app, so a
 * handshake whose origin matches the requested host is same-origin traffic.
 * Accepting it keeps every alias working (apex domain, *.vercel.app, previews)
 * without widening access to genuine cross-site callers.
 */
export function isSameOriginWebSocketRequest(
  origin: string | undefined,
  host: string | string[] | undefined,
) {
  const normalizedOrigin = normalizeHttpOrigin(origin);
  const normalizedHost = firstHeader(host)?.trim().toLowerCase();
  if (!normalizedOrigin || !normalizedHost) return false;
  return new URL(normalizedOrigin).host.toLowerCase() === normalizedHost;
}

export function allowWebSocketRequest(
  request: {
    headers: WebSocketHeaders;
  },
  callback: (error: string | null | undefined, success: boolean) => void,
) {
  const origin = firstHeader(request.headers.origin);
  callback(
    null,
    origin === undefined
      ? readNativeLiveTicket(request.headers) !== null
      : isAllowedWebSocketOrigin(origin) ||
          isSameOriginWebSocketRequest(origin, request.headers.host),
  );
}
