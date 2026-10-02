// Local browser fixture only. No authentication or persistence substitute ships in app routes.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createWorld,
  executeCommand,
  advanceWorld,
  projectWorld,
  kingdomsCommandSchema,
  kingdomsConfigSchema,
} from '../../src/lib/kingdoms/engine';
import { defaultKingdomsConfig } from '../../src/lib/kingdoms/config';

async function main() {
  if (process.env.VILLAGE_SCENE_E2E !== '1')
    throw new Error('This fixture requires VILLAGE_SCENE_E2E=1.');
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const viteRequire = createRequire(require.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
  const { default: react } = await import(
    pathToFileURL(require.resolve('@vitejs/plugin-react')).href
  );
  const config = kingdomsConfigSchema.parse({
    ...defaultKingdomsConfig,
    buildings: Object.fromEntries(
      Object.entries(defaultKingdomsConfig.buildings).map(([key, building]) => [
        key,
        { ...building, seconds: 2 },
      ]),
    ),
  });
  const newWorld = () => {
    const at = Date.now() - 5000;
    const founded = executeCommand(
      createWorld(at, config),
      'browser-player',
      { type: 'found', name: 'مملكة الاختبار' },
      at,
    );
    const villageId = Object.keys(founded.villages)[0];
    return advanceWorld(
      executeCommand(founded, 'browser-player', { type: 'build', villageId, building: 'farm' }, at),
      Date.now(),
    );
  };
  let world = newWorld();
  const snapshot = () => {
    world = advanceWorld(world, Date.now());
    return {
      ...projectWorld(world, 'browser-player', Date.now()),
      worldId: 'browser-world',
      worldName: 'عالم الاختبار المحلي',
      revision: 0,
      paused: false,
    };
  };
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:3310');
    const reply = (data: unknown, status = 200) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ success: status === 200, data }));
    };
    if (url.pathname === '/__village_test/reset' && request.method === 'POST') {
      world = newWorld();
      reply(true);
      return;
    }
    if (url.pathname === '/api/kingdoms/worlds') {
      reply([
        {
          id: 'browser-world',
          name: 'عالم الاختبار المحلي',
          revision: 0,
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }
    if (url.pathname === '/api/kingdoms/village-onboarding') {
      reply({ completed: true, completedAt: '2026-10-02T00:00:00Z' });
      return;
    }
    if (url.pathname === '/api/kingdoms' && request.method === 'GET') {
      reply(snapshot());
      return;
    }
    if (url.pathname === '/api/kingdoms' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        try {
          world = executeCommand(
            world,
            'browser-player',
            kingdomsCommandSchema.parse(JSON.parse(body).command),
            Date.now(),
          );
          reply(snapshot());
        } catch (error) {
          response.statusCode = 400;
          response.setHeader('Content-Type', 'application/json');
          response.end(
            JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'أمر غير صالح',
            }),
          );
        }
      });
      return;
    }
    if (url.pathname.startsWith('/socket.io')) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      const html =
        '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/village-scene-harness.tsx"></script></body></html>';
      void server.transformIndexHtml('/', html).then((html: string) => response.end(html));
      return;
    }
    next();
  };
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    plugins: [
      react(),
      {
        name: 'village-local-fixture',
        configureServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
          server.middlewares.use(middleware);
        },
      },
    ],
    resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
    define: {
      'process.env': JSON.stringify({
        NODE_ENV: 'development',
        NEXT_PUBLIC_REALTIME_URL: 'http://127.0.0.1:3310',
      }),
    },
    server: { host: '127.0.0.1', port: 3310, strictPort: true },
  });
  await server.listen();
  const close = () => {
    void server.close().then(() => process.exit(0));
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
