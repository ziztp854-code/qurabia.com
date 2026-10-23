import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyProductionCi } from './vercel-ci-gate.mjs';

const sha = 'a'.repeat(40);
const env = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_SHA: sha };
const success = {
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  path: '.github/workflows/nextjs.yml',
  run_number: 1,
  run_attempt: 1,
  status: 'completed',
  conclusion: 'success',
};
function clock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    timeoutMs: 300,
    pollMs: 100,
    log: () => {},
  };
}

test('preview builds do not wait for a main push workflow', async () => {
  await verifyProductionCi({
    env: { VERCEL_ENV: 'preview' },
    fetchRuns: () => assert.fail('must skip'),
  });
});
test('production fails closed without an exact commit SHA', async () => {
  await assert.rejects(verifyProductionCi({ env: { VERCEL_ENV: 'production' } }), /SHA/);
});
test('the exact production commit can proceed only after CI completes successfully', async () => {
  let calls = 0;
  await verifyProductionCi({
    env,
    ...clock(),
    fetchRuns: async (requestedSha) => {
      assert.equal(requestedSha, sha);
      return [++calls === 1 ? { ...success, status: 'in_progress', conclusion: null } : success];
    },
  });
  assert.equal(calls, 2);
});
test('failed, cancelled, skipped and neutral CI never release production', async () => {
  for (const conclusion of ['failure', 'cancelled', 'skipped', 'neutral', 'timed_out']) {
    await assert.rejects(
      verifyProductionCi({
        env,
        ...clock(),
        fetchRuns: async () => [{ ...success, conclusion }],
      }),
      /failed CI/,
    );
  }
});
test('other commits, pull requests, branches and workflows cannot satisfy the gate', async () => {
  for (const override of [
    { head_sha: 'b'.repeat(40) },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { path: '.github/workflows/other.yml' },
  ]) {
    await assert.rejects(
      verifyProductionCi({
        env,
        ...clock(),
        fetchRuns: async () => [{ ...success, ...override }],
      }),
      /Timed out/,
    );
  }
});
test('a newer failed run takes precedence over an earlier success', async () => {
  await assert.rejects(
    verifyProductionCi({
      env,
      ...clock(),
      fetchRuns: async () => [success, { ...success, run_number: 2, conclusion: 'failure' }],
    }),
    /failed CI/,
  );
});
test('unavailable CI status fails closed and never signals a successful release', async () => {
  await assert.rejects(
    verifyProductionCi({
      env,
      ...clock(),
      fetchRuns: async () => {
        throw new Error('status unavailable');
      },
    }),
    /status unavailable/,
  );
});
