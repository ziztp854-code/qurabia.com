// Standalone browser fixture only; it never runs through production app routes.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseMapPayload } from '@mamluk/world-map-core';
import { approvedPayload } from '../../src/components/mamluk-map/map-fixture';

async function main() {
  if (process.env.GLOBE_SCENE_E2E !== '1')
    throw new Error('This fixture requires GLOBE_SCENE_E2E=1.');
  await import(pathToFileURL(path.join(process.cwd(), '../../scripts/prepare-maplibre-workers.mjs')).href);
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const viteRequire = createRequire(require.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
  const { default: react } = await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
  const original = approvedPayload().layers.cities.features[0]!;
  if (original.geometry.type !== 'Point') throw new Error('The approved city must be a point.');
  const originalCoordinates = original.geometry.coordinates;
  let relocated = false;
  // Continuity controls: reset by /__globe_test/reset, never reachable outside this fixture.
  const control = { fault: 'ok' as 'ok' | '503' | '401' | '400', ttlMs: 15000, level: 12, revision: 0 };
  const requests = { viewport: 0, overview: 0 };
  const tierFor = (level: number) => (level <= 5 ? 1 : level <= 10 ? 2 : level <= 20 ? 3 : level <= 30 ? 4 : level <= 40 ? 5 : 6);
  const faulty = (status: (code: number) => void) => {
    const code = { '503': 503, '401': 401, '400': 400, ok: 0 }[control.fault];
    if (code) status(code);
    return code !== 0;
  };
  const location = () => relocated ? [31.35, 30.12] : originalCoordinates;
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1:3311');
    const json = (value: unknown, status = 200) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify(value));
    };
    if (url.pathname === '/__globe_test/reset' && request.method === 'POST') {
      relocated = false;
      Object.assign(control, { fault: 'ok', ttlMs: 15000, level: 12, revision: 0 });
      requests.viewport = 0;
      requests.overview = 0;
      json({ success: true });
      return;
    }
    if (url.pathname === '/__globe_test/stats' && request.method === 'GET') {
      json({ ...requests, ...control });
      return;
    }
    if (url.pathname === '/__globe_test/control' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const next = JSON.parse(body || '{}') as Partial<typeof control>;
        if (next.fault !== undefined) control.fault = next.fault;
        if (next.ttlMs !== undefined) control.ttlMs = next.ttlMs;
        if (next.level !== undefined) { control.level = next.level; control.revision += 1; }
        json({ success: true });
      });
      return;
    }
    if (url.pathname === '/__globe_test/relocated' && request.method === 'POST') {
      relocated = true;
      json({ success: true });
      return;
    }
    if (url.pathname === '/api/kingdoms/world-map/overview') {
      requests.overview += 1;
      if (faulty((code) => json({ error: 'Fixture fault' }, code))) return;
      json({ worldId: 'world', revision: relocated ? '2' : '1', serverTime: Date.now(),
        cells: { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'cell:14:8',
          geometry: { type: 'Point', coordinates: location() },
          properties: { count: 1, targetVillageId: 'cairo' } }] } });
      return;
    }
    if (url.pathname.replace(/\/$/, '') === '/api/kingdoms/world-map/location') {
      const [longitude, latitude] = location();
      json({ worldId: 'world', villageId: 'cairo', name: 'القاهرة', longitude, latitude,
        revision: relocated ? '2' : '1' });
      return;
    }
    if (url.pathname === '/api/kingdoms/world-map/viewport') {
      requests.viewport += 1;
      if (faulty((code) => json({ error: 'Fixture fault' }, code))) return;
      const worldId = url.searchParams.get('worldId');
      const bounds = Object.fromEntries(['west', 'south', 'east', 'north'].map((key) => [
        key, Number(url.searchParams.get(key)),
      ])) as { west: number; south: number; east: number; north: number };
      if (!['world', 'public-atlas'].includes(worldId ?? '') ||
        Object.values(bounds).some((value) => !Number.isFinite(value)) ||
        bounds.west < -180 || bounds.east > 180 || bounds.south < -90 || bounds.north > 90 ||
        bounds.west >= bounds.east || bounds.south >= bounds.north) {
        json({ error: 'Invalid fixture viewport' }, 400);
        return;
      }
      const [longitude, latitude] = worldId === 'public-atlas'
        ? originalCoordinates : location();
      const base = approvedPayload(worldId!, String((relocated ? 2 : 1) + control.revision));
      const serverTime = Date.now();
      const visible = longitude! >= bounds.west && longitude! <= bounds.east &&
        latitude! >= bounds.south && latitude! <= bounds.north;
      const payload = parseMapPayload({
        ...base,
        serverTime,
        expiresAt: serverTime + control.ttlMs,
        bounds,
        layers: {
          ...base.layers,
          cities: {
            type: 'FeatureCollection',
            features: visible ? [{
              ...original,
              geometry: { type: 'Point', coordinates: [longitude, latitude] },
              properties: {
                ...original.properties,
                ownerPlayerId: worldId === 'public-atlas' ? null : 'viewer',
                ...(worldId === 'public-atlas' ? {} : {
                  villageLevel: control.level,
                  villageRank: 'قرية',
                  villagePower: control.level * 10,
                  villageVisualTier: tierFor(control.level),
                  constructionStatus: 'IDLE',
                  kingdomName: 'مملكة الاختبار',
                  allianceName: null,
                  population: null,
                }),
              },
            }] : [],
          },
        },
      });
      response.setHeader('X-Mamluk-Public-Settlements', '1');
      json(payload);
      return;
    }
    if (url.pathname === '/api/kingdoms/world-map/relocate/') {
      if (url.searchParams.get('worldId') !== 'world' ||
        url.searchParams.get('villageId') !== 'cairo' || request.method !== 'GET') {
        json({ success: false, error: 'Unavailable fixture action' }, 403);
        return;
      }
      const [longitude, latitude] = location();
      json({ success: true, data: {
        worldId: 'world', villageId: 'cairo', longitude, latitude,
        relocationUsed: relocated, canRelocate: false, reason: 'unavailable',
        bounds: { west: -179.9, south: -85, east: 179.9, north: 85 },
        revision: relocated ? 2 : 1,
      } });
      return;
    }
    if (url.pathname === '/' || url.pathname === '/globe') {
      response.setHeader('Content-Type', 'text/html');
      const html = '<!doctype html><html lang="ar" dir="rtl"><head>' +
        '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
        '<body><div id="root"></div><script type="module" src="/e2e/fixtures/globe-scene-harness.tsx"></script></body></html>';
      void server.transformIndexHtml('/globe', html).then((html: string) => response.end(html));
      return;
    }
    next();
  };
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: path.join(process.cwd(), 'node_modules/.vite-globe-scene'),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    plugins: [react(), {
      name: 'globe-local-fixture',
      configureServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
        server.middlewares.use(middleware);
      },
    }],
    resolve: { alias: {
      '@': path.join(process.cwd(), 'src'),
      '@mamluk/maplibre-adapter': path.join(process.cwd(), '../../packages/mamluk-maplibre-adapter/src/index.ts'),
      '@mamluk/world-map-core': path.join(process.cwd(), '../../packages/mamluk-world-map-core/src/index.ts'),
    } },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: { host: '127.0.0.1', port: 3311, strictPort: true },
  });
  await server.listen();
  const close = () => { void server.close().then(() => process.exit(0)); };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
