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
  let frozenNow: number | undefined;
  const serverNow = () => frozenNow ?? Date.now();
  const snapshot = () => {
    world = advanceWorld(world, serverNow());
    return {
      ...projectWorld(world, 'browser-player', serverNow()),
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
    if (url.pathname === '/__village_test/incoming-attack' && request.method === 'POST') {
      const at = Date.now();
      frozenNow = at;
      world = executeCommand(createWorld(at, config), 'browser-player', { type: 'found', name: 'مملكة الاختبار' }, at);
      world = executeCommand(world, 'attacker', { type: 'found', name: 'مملكة الظل' }, at);
      const defender = Object.values(world.villages).find((village) => village.ownerId === 'browser-player')!;
      const attackerVillage = Object.values(world.villages).find((village) => village.ownerId === 'attacker')!;
      world.players['browser-player']!.protectionUntil = at;
      world.players.attacker!.protectionUntil = at;
      world = {
        ...world,
        villages: {
          ...world.villages,
          [attackerVillage.id]: {
            ...attackerVillage,
            troops: { guard: 20, rider: 0, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
          },
        },
      };
      world = executeCommand(
        world,
        'attacker',
        {
          type: 'march',
          villageId: attackerVillage.id,
          targetX: defender.x,
          targetY: defender.y,
          mission: 'attack',
          troops: { guard: 8, rider: 0, scout: 0, settler: 0, archer: 0, mounted_archer: 0, sultan_guard: 0, siege_engineer: 0, siege_tower: 0 },
        },
        at,
      );
      reply(snapshot());
      return;
    }
    if (url.pathname === '/__village_test/reset' && request.method === 'POST') {
      frozenNow = undefined;
      world = newWorld();
      reply(true);
      return;
    }
    if (url.pathname === '/__village_test/resource-scenario' && request.method === 'POST') {
      frozenNow = undefined;
      world = newWorld();
      const village = Object.values(world.villages)[0];
      world = { ...world, villages: { ...world.villages, [village.id]: { ...village,
        buildings: { ...village.buildings, lumber: 3, quarry: 3, mine: 3, farm: 3, treasury: 3 },
        resources: { wood: 6000, stone: 6000, iron: 6000, food: 6000, gold: 6000 },
      } } };
      reply(snapshot());
      return;
    }
    if (url.pathname === '/__village_test/offline-scenario' && request.method === 'POST') {
      frozenNow = Date.now();
      world = executeCommand(createWorld(frozenNow, { ...defaultKingdomsConfig, storageBase: 100000 }), 'browser-player', { type: 'found', name: 'مملكة الاختبار' }, frozenNow);
      const village = Object.values(world.villages)[0];
      world = { ...world, villages: { [village.id]: { ...village,
        buildings: { ...village.buildings, hall: 7, wall: 5, warehouse: 8, barracks: 1 },
        resources: { wood: 60000, stone: 60000, iron: 60000, food: 60000, gold: 60000 },
        progression: { ...village.progression!, xp: 2175, signature: '' },
      } } };
      world = executeCommand(world, 'browser-player', { type: 'train', villageId: village.id, unit: 'guard', count: 5 }, frozenNow);
      reply(snapshot());
      return;
    }
    if (url.pathname === '/__village_test/advance-five-hours' && request.method === 'POST' && frozenNow !== undefined) {
      frozenNow += 5 * 60 * 60 * 1000;
      reply(snapshot());
      return;
    }
    if (url.pathname === '/api/kingdoms/worlds') {
      reply([
        {
          id: 'browser-world',
          name: 'عالم الاختبار المحلي',
          revision: 0,
          status: 'OPEN',
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
            serverNow(),
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
      {
        name: 'stub-world-map',
        enforce: 'pre',
        resolveId(id: string) {
          if (id.includes('mamluk-world-map') && !id.includes('e2e/fixtures')) {
            return path.join(process.cwd(), 'e2e/fixtures/mamluk-world-map-stub.tsx');
          }
          return null;
        },
      },
      react(),
      {
        name: 'village-local-fixture',
        configureServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
          server.middlewares.use(middleware);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.join(process.cwd(), 'src'),
        '@mamluk/maplibre-adapter': path.join(process.cwd(), 'e2e/fixtures/maplibre-adapter-stub.ts'),
      },
    },
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
