// Standalone loopback fixture. No production routes, accounts or databases.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ZodError } from 'zod';
import {
  AbandonedPreviewStore,
  PREVIEW_ALPHA,
  PreviewHttpError,
  previewBasemap,
} from './abandoned-preview-state';

const origin = 'http://127.0.0.1:3348';
async function main() {
  if (process.env.ABANDONED_VILLAGE_PREVIEW !== '1')
    throw new Error('ABANDONED_VILLAGE_PREVIEW=1 is required');
  await import(
    pathToFileURL(path.join(process.cwd(), '../../scripts/prepare-maplibre-workers.mjs')).href
  );
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const viteRequire = createRequire(require.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
  const { default: react } = await import(
    pathToFileURL(require.resolve('@vitejs/plugin-react')).href
  );
  let store = new AbandonedPreviewStore();
  const sessions = new Map<string, string>();
  const basemap = previewBasemap();
  function session(request: IncomingMessage) {
    const value = request.headers.cookie
      ?.split(';')
      .find((part) => part.trim().startsWith('abandoned_preview='))
      ?.trim()
      .slice('abandoned_preview='.length);
    const actor = value ? sessions.get(value) : undefined;
    if (!actor) throw new PreviewHttpError(401, 'جلسة المعاينة غير متاحة');
    return actor;
  }
  function setSession(response: ServerResponse, actor: string) {
    const token = randomBytes(24).toString('hex');
    sessions.set(token, actor);
    response.setHeader(
      'Set-Cookie',
      `abandoned_preview=${token}; HttpOnly; SameSite=Strict; Path=/`,
    );
  }
  async function body(request: IncomingMessage) {
    if (request.headers.origin !== origin) throw new PreviewHttpError(403, 'مصدر الطلب غير مسموح');
    if (request.headers['content-type']?.split(';')[0] !== 'application/json')
      throw new PreviewHttpError(415, 'مطلوب JSON');
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 32768) throw new PreviewHttpError(413, 'الطلب كبير جدًا');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new PreviewHttpError(400, 'طلب غير صالح');
    }
  }
  const middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url ?? '/', origin);
    const json = (value: unknown, status = 200) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify(value));
    };
    const run = async () => {
      if (url.pathname === '/__preview_test/reset' && request.method === 'POST') {
        await body(request);
        store = new AbandonedPreviewStore();
        json({ ok: true });
        return;
      }
      if (url.pathname === '/__preview_test/session' && request.method === 'POST') {
        const input = await body(request);
        if (!['alice', 'bob'].includes(String(input.actor)))
          throw new PreviewHttpError(400, 'Unknown fixture actor');
        setSession(response, String(input.actor));
        json({ ok: true });
        return;
      }
      if (url.pathname === '/__preview_test/advance' && request.method === 'POST') {
        session(request);
        const input = await body(request);
        await store.advance(Number(input.milliseconds));
        json({ ok: true });
        return;
      }
      if (url.pathname === '/api/abandoned-preview/basemap' && request.method === 'GET') {
        session(request);
        json(basemap);
        return;
      }
      if (url.pathname === '/api/abandoned-preview/world' && request.method === 'GET') {
        json(store.view(url.searchParams.get('worldId') ?? PREVIEW_ALPHA, session(request)));
        return;
      }
      if (url.pathname === '/api/abandoned-preview/command' && request.method === 'POST') {
        const actor = session(request),
          input = await body(request);
        json(await store.command(String(input.worldId), actor, String(input.key), input.command));
        return;
      }
      if (url.pathname === '/' && ['GET', 'HEAD'].includes(request.method ?? '')) {
        try {
          session(request);
        } catch {
          setSession(response, 'alice');
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (request.method === 'HEAD') {
          response.end();
          return;
        }
        const html =
          '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
          '<body><div id="root"></div><script type="module" src="/e2e/fixtures/abandoned-village-harness.tsx"></script></body></html>';
        response.end(await server.transformIndexHtml('/', html));
        return;
      }
      next();
    };
    void run().catch((error) =>
      json(
        { error: error instanceof Error ? error.message : 'تعذر الطلب' },
        error instanceof PreviewHttpError ? error.status : error instanceof ZodError ? 400 : 422,
      ),
    );
  };
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: path.join(process.cwd(), 'node_modules/.vite-abandoned-preview'),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    plugins: [
      react(),
      {
        name: 'abandoned-local-fixture',
        configureServer(server: { middlewares: { use: (handler: typeof middleware) => void } }) {
          server.middlewares.use(middleware);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.join(process.cwd(), 'src'),
        'server-only': path.join(
          process.cwd(),
          'node_modules/next/dist/compiled/server-only/empty.js',
        ),
      },
    },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: { host: '127.0.0.1', port: 3348, strictPort: true },
  });
  await server.listen();
  console.log(`Abandoned villages local preview: ${origin}`);
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
