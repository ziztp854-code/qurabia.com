import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const guardPath = path.resolve(process.cwd(), '../../scripts/check-public-supabase-exposure.mjs');

describe('public Supabase exposure guard', () => {
  it('rejects public Supabase key environment variables without printing their values', () => {
    const fixtureValue = 'test-public-key-value';
    const result = spawnSync(process.execPath, [guardPath, '--env-only'], {
      encoding: 'utf8',
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_ANON_KEY: fixtureValue },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(result.stderr).not.toContain(fixtureValue);
  });

  it('rejects Supabase project URLs and JWTs in build output without printing them', () => {
    const buildDir = mkdtempSync(path.join(tmpdir(), 'qurabia-exposure-'));
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fake_signature_12345';

    try {
      writeFileSync(
        path.join(buildDir, 'bundle.js'),
        `znncdgapgkkjutnsjzbh.supabase.co ${jwt}`,
      );

      const result = spawnSync(process.execPath, [guardPath, '--build-dir', buildDir], {
        encoding: 'utf8',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([name]) => !/^NEXT_PUBLIC_SUPABASE_.*KEY$/i.test(name),
          ),
        ) as NodeJS.ProcessEnv,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('bundle.js');
      expect(result.stderr).toContain('Supabase project URL');
      expect(result.stderr).toContain('JWT');
      expect(result.stderr).not.toContain(jwt);
    } finally {
      rmSync(buildDir, { recursive: true, force: true });
    }
  });
});
