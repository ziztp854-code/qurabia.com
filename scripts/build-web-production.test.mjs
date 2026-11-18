import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWebProduction } from './build-web-production.mjs';
import { verifyProductionCi } from './production-ci-gate.mjs';

test('a failed CI gate cannot run any compiler', async () => {
  await assert.rejects(
    buildWebProduction({
      verifyCi: async () => {
        throw new Error('CI failed');
      },
      run: () => assert.fail('must not run after rejected CI'),
    }),
    /CI failed/,
  );
});

test('production verifies the source commit before building dependent packages', async () => {
  const calls = [];
  const env = { RENDER: 'true', RENDER_GIT_COMMIT: 'a'.repeat(40), PRIVATE_BINDING: 'retained' };
  await buildWebProduction({
    env,
    verifyCi: async ({ env: supplied }) => {
      assert.equal(supplied.DEPLOY_ENV, 'production');
      assert.equal(supplied.RENDER_GIT_COMMIT, env.RENDER_GIT_COMMIT);
      calls.push('CI');
    },
    run: (command, args, options) => {
      assert.equal(options.env.PRIVATE_BINDING, 'retained');
      assert.equal(options.env.DEPLOY_ENV, 'production');
      assert.equal(command, 'corepack');
      calls.push(args[2]);
    },
  });
  assert.deepEqual(calls, [
    'CI',
    '@tahaddi/contracts',
    '@tahaddi/database',
    '@tahaddi/domain',
    '@mamluk/world-map-core',
    '@mamluk/maplibre-adapter',
    '@tahaddi/web',
  ]);
});

test('Render production cannot bypass CI by omitting custom deployment metadata', async () => {
  let called = false;
  await assert.rejects(
    verifyProductionCi({
      env: { RENDER: 'true' },
      fetchRuns: () => {
        called = true;
      },
    }),
    /SHA/,
  );
  assert.equal(called, false);
});

test('an explicit commit cannot override the actual Render checkout', async () => {
  await assert.rejects(
    verifyProductionCi({
      env: { RENDER: 'true', RENDER_GIT_COMMIT: 'a'.repeat(40), DEPLOY_COMMIT_SHA: 'b'.repeat(40) },
      fetchRuns: () => assert.fail('wrong source must be rejected before looking up CI'),
    }),
    /does not match/,
  );
});

test('Render pull-request previews do not query production CI', async () => {
  await verifyProductionCi({
    env: { RENDER: 'true', IS_PULL_REQUEST: 'true' },
    fetchRuns: () => assert.fail('preview must not query production CI'),
  });
});

test('Render production uses the checkout SHA without hosting compatibility variables', async () => {
  const sha = 'a'.repeat(40);
  await verifyProductionCi({
    env: { RENDER: 'true', RENDER_GIT_COMMIT: sha },
    log: () => {},
    fetchRuns: async (requested) => {
      assert.equal(requested, sha);
      return [
        {
          head_sha: sha,
          head_branch: 'main',
          event: 'push',
          path: '.github/workflows/nextjs.yml',
          run_number: 1,
          run_attempt: 1,
          status: 'completed',
          conclusion: 'success',
        },
      ];
    },
  });
});

test('a misspelled environment cannot silently skip the release gate', async () => {
  await assert.rejects(
    verifyProductionCi({
      env: { DEPLOY_ENV: 'prodution' },
      fetchRuns: () => assert.fail('invalid environment must fail before querying CI'),
    }),
    /Invalid DEPLOY_ENV/,
  );
});
