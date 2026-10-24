import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function productionConfig(overrides: Record<string, string> = {}) {
  const environment = { ...process.env };
  for (const key of [
    'NEXT_PUBLIC_SENTRY_RELEASE',
    'SENTRY_RELEASE',
    'VERCEL_GIT_COMMIT_SHA',
    'RENDER_GIT_COMMIT',
    'GITHUB_SHA',
    'SENTRY_SOURCE_MAPS_AUTH_TOKEN',
  ])
    delete environment[key];
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      `
    const loadConfig = require('next/dist/server/config').default;
    const { PHASE_PRODUCTION_BUILD } = require('next/constants');
    (async () => {
      const first = await loadConfig(PHASE_PRODUCTION_BUILD, process.cwd());
      const second = await loadConfig(PHASE_PRODUCTION_BUILD, process.cwd());
      console.log('SENTRY_CONFIG_RESULT=' + JSON.stringify({
        release: first.env.NEXT_PUBLIC_SENTRY_RELEASE,
        inherited: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
        repeated: second.env.NEXT_PUBLIC_SENTRY_RELEASE,
      }));
    })().catch(() => process.exit(1));
  `,
    ],
    {
      cwd: process.cwd(),
      env: { ...environment, ...overrides, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8',
    },
  );
  const line = output.split('\n').find((value) => value.startsWith('SENTRY_CONFIG_RESULT='));
  if (!line) throw new Error('Production configuration did not return a release');
  return JSON.parse(line.slice('SENTRY_CONFIG_RESULT='.length));
}

describe('actual Next.js production release configuration', () => {
  // The first cold Next/Sentry config load took 44s under the full four-worker
  // Windows suite; subsequent loads are warm. Keep the release assertions and
  // give only this cold-start integration check a bounded 60-second budget.
  it('uses the checkout commit without release environment variables', () => {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = productionConfig();
    expect(result).toEqual({
      release: `qurabia-web@${commit}`,
      inherited: `qurabia-web@${commit}`,
      repeated: `qurabia-web@${commit}`,
    });
  }, 60000);

  it('respects an explicit release and exposes it to the browser and build workers', () => {
    expect(productionConfig({ SENTRY_RELEASE: 'synthetic-release-42' })).toEqual({
      release: 'synthetic-release-42',
      inherited: 'synthetic-release-42',
      repeated: 'synthetic-release-42',
    });
  }, 15000);

  it('shares a generated build identifier when Git and release metadata are absent', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'sentry-no-git-'));
    try {
      // Restrict only the child process lookup; a shell shim cannot hide git.exe on Windows.
      const result = productionConfig({ PATH: directory });
      expect(result.release).toMatch(/^qurabia-web@build-[a-f0-9-]{36}$/);
      expect(result.inherited).toBe(result.release);
      expect(result.repeated).toBe(result.release);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15000);
});
