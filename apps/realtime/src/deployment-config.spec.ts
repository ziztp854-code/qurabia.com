import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type VercelConfig = {
  services?: {
    realtime?: {
      root?: string;
      entrypoint?: string;
      framework?: string;
    };
  };
  rewrites?: Array<{
    source?: string;
    destination?: {
      service?: string;
    };
  }>;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

describe('Vercel realtime deployment', () => {
  const config = JSON.parse(
    readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf8'),
  ) as VercelConfig;
  const rootPackage = JSON.parse(
    readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
  ) as PackageJson;

  it('routes realtime handshakes before the web catch-all on the shared domain', () => {
    expect(config.services?.realtime).toMatchObject({
      root: '.',
      entrypoint: 'apps/realtime/vercel-entry.cjs',
      framework: 'nestjs',
    });
    expect(config.rewrites?.slice(0, 4)).toEqual([
      { source: '/socket.io/(.*)', destination: { service: 'realtime' } },
      { source: '/health', destination: { service: 'realtime' } },
      { source: '/realtime/(.*)', destination: { service: 'realtime' } },
      { source: '/(.*)', destination: { service: 'web' } },
    ]);
  });

  it('keeps realtime runtime dependencies visible to the Vercel function packager', () => {
    const dependencies = rootPackage.dependencies ?? {};
    const runtimePackages = [
      '@nestjs/core',
      '@nestjs/common',
      '@nestjs/platform-socket.io',
      '@nestjs/websockets',
      'ioredis',
      'socket.io',
      'zod',
    ];

    for (const packageName of runtimePackages) {
      expect(dependencies[packageName]).toEqual(expect.any(String));
    }

    expect(dependencies['@tahaddi/contracts']).toBe('workspace:*');
    expect(dependencies['@tahaddi/database']).toBe('workspace:*');
    expect(dependencies['@tahaddi/domain']).toBe('workspace:*');
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
