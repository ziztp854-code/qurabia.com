import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const repository = 'ziztp854-code/qurabia.com';
const workflowPath = '.github/workflows/nextjs.yml';

async function fetchWorkflowRuns(sha) {
  const url = new URL(
    `https://api.github.com/repos/${repository}/actions/workflows/nextjs.yml/runs`,
  );
  url.search = new URLSearchParams({
    head_sha: sha,
    branch: 'main',
    event: 'push',
    per_page: '10',
  });
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'qurabia-production-ci-gate',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
  } catch {
    throw new Error('GitHub CI status could not be verified; production build blocked');
  }
  if (!response.ok)
    throw new Error(`GitHub CI status returned HTTP ${response.status}; production build blocked`);
  const data = await response.json();
  if (!Array.isArray(data.workflow_runs))
    throw new Error('GitHub CI status response was invalid; production build blocked');
  return data.workflow_runs;
}

/** Fail closed: only the exact production commit's successful push workflow can release it. */
export async function verifyProductionCi({
  env = process.env,
  fetchRuns = fetchWorkflowRuns,
  sleep = delay,
  now = Date.now,
  log = console.log,
  timeoutMs = 20 * 60_000,
  pollMs = 60_000,
} = {}) {
  if (env.VERCEL_ENV !== 'production') return;
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  if (!/^[a-f0-9]{40}$/.test(sha ?? ''))
    throw new Error('Production commit SHA is missing or invalid; production build blocked');
  const started = now();
  log(`[production-ci] waiting for CI on ${sha.slice(0, 7)}`);
  while (now() - started < timeoutMs) {
    const runs = await fetchRuns(sha);
    const run = runs
      .filter(
        (item) =>
          item.head_sha === sha &&
          item.head_branch === 'main' &&
          item.event === 'push' &&
          item.path === workflowPath,
      )
      .sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success')
        throw new Error('The production commit failed CI; production build blocked');
      log(`[production-ci] CI passed for ${sha.slice(0, 7)}`);
      return;
    }
    const remaining = timeoutMs - (now() - started);
    if (remaining > 0) await sleep(Math.min(pollMs, remaining));
  }
  throw new Error(
    'Timed out waiting for the production commit to pass CI; production build blocked',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyProductionCi().catch((error) => {
    console.error(`[production-ci] ${error.message}`);
    process.exitCode = 1;
  });
}
