import { withSentryConfig } from '@sentry/nextjs/config';
import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { withWorkflow } from 'workflow/next';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolveSentryBuildRelease } from './src/lib/observability/sentry-release';
import {
  buildWebSecurityHeaders,
  embeddedGameSecurityHeaders,
} from '../../config/web-security.mjs';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || value === '') continue;
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

if (process.env.NODE_ENV !== 'production' && process.env.MAMLUK_LOCAL_BUILD !== '1') {
  loadEnvFile(path.resolve(process.cwd(), '../../.env'));
}

const isProduction = process.env.NODE_ENV === 'production';
const sentrySourceMapsToken = process.env.SENTRY_SOURCE_MAPS_AUTH_TOKEN?.trim();
let buildRevision: string;
try {
  buildRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  buildRevision = `build-${randomUUID()}`;
}
const sentryRelease = resolveSentryBuildRelease(process.env, buildRevision);
// Share the same fallback with build workers even in source archives without Git.
process.env.NEXT_PUBLIC_SENTRY_RELEASE = sentryRelease;

const securityHeaders = buildWebSecurityHeaders(process.env);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_SENTRY_RELEASE: sentryRelease },
  ...(process.env.MAMLUK_LOCAL_BUILD === '1' ? { distDir: '.next-mamluk' } : {}),
  serverExternalPackages: ['@mamluk/world-map-core', 'polygon-clipping'],
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  trailingSlash: true,
  experimental: {
    prefetchInlining: true,
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return ['word-code', 'spot-difference', 'scrambled-words'].map((mode) => ({
      source: `/games/${mode}`,
      destination: '/games',
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Only this standalone mini-game may be embedded by our own farm panel.
        source: '/games/sultan-farm/index.html',
        headers: embeddedGameSecurityHeaders,
      },
      {
        source: '/models/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store',
          },
        ],
      },
      {
        source: '/models/:asset(.*\\.[a-f0-9]{16}\\.glb)',
        headers: [
          {
            key: 'Cache-Control',
            value: isProduction ? 'public, max-age=31536000, immutable' : 'no-store',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const key = process.env.INDEXNOW_KEY?.trim();
    if (!key) return [];
    return [{ source: `/${key}.txt`, destination: '/api/indexnow-key' }];
  },
  turbopack: {
    root: path.resolve(process.cwd(), '../..'),
  },
};

const workflowConfig = withWorkflow(nextConfig);

export default sentrySourceMapsToken
  ? withSentryConfig(workflowConfig, {
      org: 'qurabia',
      project: 'javascript-nextjs',
      authToken: sentrySourceMapsToken,
      release: { name: sentryRelease },
      silent: !process.env.CI,
      webpack: {
        treeshake: { removeDebugLogging: true },
      },
    })
  : workflowConfig;
