/** Hosting-neutral deployment metadata. Render preview services never release production. */
export function deploymentEnvironment(env = process.env) {
  const explicit = env.DEPLOY_ENV?.trim();
  if (explicit) {
    if (!['production', 'preview', 'staging', 'development', 'test'].includes(explicit))
      throw new Error('Invalid DEPLOY_ENV; production build blocked');
    return explicit;
  }
  if (env.RENDER === 'true') return env.IS_PULL_REQUEST === 'true' ? 'preview' : 'production';
  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

export function deploymentCommit(env = process.env) {
  const commit = [env.DEPLOY_COMMIT_SHA, env.RENDER_GIT_COMMIT, env.GITHUB_SHA]
    .map((value) => value?.trim())
    .find(Boolean);
  if (!/^[a-f0-9]{40}$/.test(commit ?? ''))
    throw new Error('Production commit SHA is missing or invalid; production build blocked');
  if (env.RENDER === 'true' && env.RENDER_GIT_COMMIT?.trim() !== commit)
    throw new Error('Production commit SHA does not match the Render checkout; build blocked');
  return commit;
}
