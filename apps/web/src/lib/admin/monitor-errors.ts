import 'server-only';

export type SentryIssue = {
  id: string;
  code: string;
  lastSeen: string | null;
  url: string | null;
};

export type SentryIssuesSnapshot = {
  status: 'available' | 'unavailable' | 'unconfigured';
  issues: SentryIssue[];
};

const isSlug = (value: string) => /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value);

function safeIssueUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      (url.hostname === 'sentry.io' || url.hostname.endsWith('.sentry.io'))
      ? `${url.origin}${url.pathname}`
      : null;
  } catch {
    return null;
  }
}

function parseIssue(value: unknown): SentryIssue | null {
  if (typeof value !== 'object' || value === null) return null;
  const issue = value as Record<string, unknown>;
  if (typeof issue.id !== 'string') return null;
  return {
    id: issue.id,
    code: typeof issue.shortId === 'string' ? issue.shortId : issue.id,
    lastSeen:
      typeof issue.lastSeen === 'string' && Number.isFinite(Date.parse(issue.lastSeen))
        ? issue.lastSeen
        : null,
    url: safeIssueUrl(issue.permalink),
  };
}

export async function getRecentSentryIssues(): Promise<SentryIssuesSnapshot> {
  const token = process.env.SENTRY_AUTH_TOKEN?.trim();
  const organization = process.env.SENTRY_ORG_SLUG?.trim();
  const project = process.env.SENTRY_PROJECT_SLUG?.trim();
  if (!token || !organization || !project || !isSlug(organization) || !isSlug(project)) {
    return { status: 'unconfigured', issues: [] };
  }

  const url = new URL(`https://sentry.io/api/0/organizations/${organization}/issues/`);
  url.searchParams.set('project', project);
  url.searchParams.set('query', 'is:unresolved');
  url.searchParams.set('sort', 'date');
  url.searchParams.set('limit', '5');

  try {
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { status: 'unavailable', issues: [] };
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return { status: 'unavailable', issues: [] };
    return {
      status: 'available',
      issues: payload.map(parseIssue).filter((issue): issue is SentryIssue => issue !== null),
    };
  } catch {
    return { status: 'unavailable', issues: [] };
  }
}
