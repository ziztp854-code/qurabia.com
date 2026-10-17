/** Resolve once at build time; this value is public and must never contain a secret. */
export function resolveSentryBuildRelease(
  environment: Record<string, string | undefined>,
  fallback: string,
) {
  const explicit = [environment.NEXT_PUBLIC_SENTRY_RELEASE, environment.SENTRY_RELEASE]
    .map((value) => value?.trim())
    .find(Boolean);
  if (explicit) return explicit;
  const commit = [
    environment.VERCEL_GIT_COMMIT_SHA,
    environment.RENDER_GIT_COMMIT,
    environment.GITHUB_SHA,
  ].find((value) => value && /^[a-f0-9]{40}$/i.test(value));
  return `qurabia-web@${commit ?? fallback}`;
}
