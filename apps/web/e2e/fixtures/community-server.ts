// Local-only presentation/API fixture. Does not read production credentials or databases.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  fixtureAdmin,
  fixtureAppearance,
  fixtureProfile,
} from '../../src/components/community/community-fixtures';

type FixtureServer = {
  middlewares: {
    use: (
      handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void,
    ) => void;
  };
  transformIndexHtml: (url: string, html: string) => Promise<string>;
};
async function main() {
  if (process.env.COMMUNITY_UI_E2E !== '1')
    throw new Error('This fixture requires COMMUNITY_UI_E2E=1.');
  const root = process.cwd();
  const port = Number(process.env.COMMUNITY_UI_PORT ?? 3331);
  const req = createRequire(path.join(root, 'package.json'));
  const vr = createRequire(req.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(vr.resolve('vite')).href);
  const { default: react } = await import(pathToFileURL(req.resolve('@vitejs/plugin-react')).href);
  let profile = structuredClone(fixtureProfile);
  let appearance = structuredClone(fixtureAppearance);
  const admin = structuredClone(fixtureAdmin);
  const server = await createServer({
    configFile: false,
    root,
    envDir: path.join(root, 'e2e/fixtures'),
    plugins: [
      react(),
      {
        name: 'community-ui-fixture',
        configureServer(server: FixtureServer) {
          server.middlewares.use(async (request, response, next) => {
            const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
            const reply = (data: unknown) => {
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify({ ok: true, data }));
            };
            if (url.pathname === '/api/community/me') {
              if (request.method === 'PATCH') {
                let body = '';
                for await (const chunk of request) body += chunk;
                const input = JSON.parse(body);
                appearance = {
                  ...appearance,
                  profile: { ...appearance.profile, ...input, name: input.displayName },
                  settings: {
                    entranceEnabled: input.entranceEnabled,
                    entranceSound: input.entranceSound,
                    reduceEffects: input.reduceEffects,
                  },
                };
              }
              reply(appearance);
              return;
            }
            if (url.pathname.endsWith('/follow')) {
              profile = {
                ...profile,
                isFollowing: request.method === 'POST',
                followerCount: request.method === 'POST' ? 1 : 0,
              };
              reply({ following: profile.isFollowing });
              return;
            }
            if (url.pathname.startsWith('/api/community/profiles/')) {
              reply(profile);
              return;
            }
            if (url.pathname === '/api/community/admin') {
              reply(admin);
              return;
            }
            if (url.pathname === '/') {
              response.setHeader('Content-Type', 'text/html');
              response.end(
                await server.transformIndexHtml(
                  '/',
                  '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Community UI fixture</title></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/community-harness.tsx"></script></body></html>',
                ),
              );
              return;
            }
            next();
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.join(root, 'src'),
        '@tahaddi/domain': path.join(root, '../../packages/domain/src/index.ts'),
        'next/image': path.join(root, 'e2e/fixtures/community-next-image.tsx'),
        'next/link': path.join(root, 'e2e/fixtures/community-next-link.tsx'),
      },
    },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  console.log(`Community UI fixture: http://127.0.0.1:${port}`);
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
