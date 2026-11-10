import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PackageJson = {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe('Render realtime deployment', () => {
  const config = readFileSync(
    resolve(__dirname, '../../../render.yaml'),
    'utf8',
  );
  const rootPackage = JSON.parse(
    readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
  ) as PackageJson;

  it('uses the persistent Node runtime with a pre-deploy migration and health check', () => {
    expect(config).toContain('name: tahaddi-realtime');
    expect(config).toContain(
      'preDeployCommand: node scripts/deploy-migrations.mjs',
    );
    expect(config).toContain(
      'startCommand: corepack pnpm --filter @tahaddi/realtime start:prod',
    );
    expect(config).toContain('healthCheckPath: /health');
  });

  it('keeps monitoring optional and load tests read-only', () => {
    const dependencies = rootPackage.dependencies ?? {};
    const scripts = rootPackage.scripts ?? {};
    const httpLoadTest = readFileSync(
      resolve(__dirname, '../../../tests/load/http-smoke.js'),
      'utf8',
    );
    const realtimeLoadTest = readFileSync(
      resolve(__dirname, '../../../tests/load/realtime-handshake.js'),
      'utf8',
    );

    expect(dependencies['@sentry/nestjs']).toEqual(expect.any(String));
    expect(dependencies['@sentry/node']).toEqual(expect.any(String));
    expect(scripts['loadtest:smoke']).toContain('tests/load/http-smoke.js');
    expect(scripts['loadtest:realtime']).toContain(
      'tests/load/realtime-handshake.js',
    );
    expect(httpLoadTest).toContain('http.batch');
    expect(realtimeLoadTest).toContain('transport=polling');
    expect(httpLoadTest).not.toMatch(/http\.(post|put|patch|del)\s*\(/);
    expect(realtimeLoadTest).toContain('http.post');
    expect(realtimeLoadTest).toContain("'1'");
    expect(`${httpLoadTest}\n${realtimeLoadTest}`).toContain(
      'BASE_URL is required',
    );
  });
});
