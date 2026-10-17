import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  it('uses the checkout commit without release environment variables', () => {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = productionConfig();
    expect(result).toEqual({
      release: `qurabia-web@${commit}`,
      inherited: `qurabia-web@${commit}`,
      repeated: `qurabia-web@${commit}`,
    });
  }, 15000);

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
      writeFileSync(path.join(directory, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
      const result = productionConfig({ PATH: `${directory}${path.delimiter}${process.env.PATH}` });
      expect(result.release).toMatch(/^qurabia-web@build-[a-f0-9-]{36}$/);
      expect(result.inherited).toBe(result.release);
      expect(result.repeated).toBe(result.release);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15000);
});
