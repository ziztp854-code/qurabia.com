'use client';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);

function withNamespace(origin: string, namespace: string) {
  return `${origin.replace(/\/+$/, '')}${namespace}`;
}

function shouldUseCurrentOrigin(configured: URL, current: URL) {
  const configuredIsLoopback = LOOPBACK_HOSTS.has(configured.hostname);
  const currentIsLoopback = LOOPBACK_HOSTS.has(current.hostname);
  const wouldUseMixedContent = current.protocol === 'https:' && configured.protocol === 'http:';
  const configuredIsVercelDeployment = configured.hostname.endsWith('.vercel.app');
  const currentIsPublicAlias =
    current.protocol === 'https:' && !current.hostname.endsWith('.vercel.app');

  return (
    (!currentIsLoopback && configuredIsLoopback) ||
    wouldUseMixedContent ||
    (currentIsPublicAlias && configuredIsVercelDeployment)
  );
}

type RealtimeNamespace =
  | '/'
  | '/special-games'
  | '/baloot'
  | '/ladder'
  | '/scrambled-words'
  | '/elimination';

function resolveDefaultOrigin(currentOrigin: string, namespace: RealtimeNamespace) {
  try {
    const current = new URL(currentOrigin);
    const currentIsLoopback = LOOPBACK_HOSTS.has(current.hostname);

    if (currentIsLoopback) {
      return withNamespace('http://localhost:3001', namespace);
    }
  } catch {
    return namespace;
  }

  return namespace;
}

export function resolveRealtimeNamespaceUrl(
  configuredUrl: string | undefined,
  currentOrigin: string,
  namespace: RealtimeNamespace,
) {
  const normalizedUrl = configuredUrl?.trim().replace(/\/+$/, '');
  if (!normalizedUrl) return resolveDefaultOrigin(currentOrigin, namespace);

  try {
    const configured = new URL(normalizedUrl);
    const current = new URL(currentOrigin);

    if (shouldUseCurrentOrigin(configured, current)) {
      return withNamespace(current.origin, namespace);
    }

    return withNamespace(normalizedUrl, namespace);
  } catch {
    return namespace;
  }
}
