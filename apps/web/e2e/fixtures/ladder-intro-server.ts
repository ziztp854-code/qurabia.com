// Loopback-only presentation fixture: real component/media, synthetic room state.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

async function main() {
  if (process.env.LADDER_INTRO_E2E !== '1') throw Error('Set LADDER_INTRO_E2E=1');
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const viteRequire = createRequire(require.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
  const { default: react } = await import(
    pathToFileURL(require.resolve('@vitejs/plugin-react')).href
  );
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    cacheDir: 'node_modules/.vite-ladder-intro',
    optimizeDeps: { entries: ['e2e/fixtures/ladder-intro-harness.tsx'] },
    plugins: [
      react(),
      {
        name: 'ladder-intro-fixture',
        configureServer(vite: { middlewares: { use: (handler: Middleware) => void } }) {
          vite.middlewares.use((req, res, next) => {
            if (new URL(req.url || '/', 'http://127.0.0.1:3427').pathname !== '/') return next();
            res.setHeader('Content-Type', 'text/html');
            void server
              .transformIndexHtml(
                '/',
                '<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><head><title>Ladder intro local fixture</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/ladder-intro-harness.tsx"></script></body></html>',
              )
              .then((html: string) => res.end(html));
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.join(process.cwd(), 'src'),
        'next/link': path.join(process.cwd(), 'e2e/fixtures/community-next-link.tsx'),
      },
    },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: {
      host: '127.0.0.1',
      port: 3427,
      strictPort: true,
      watch: { ignored: ['**/.next/**', '**/test-results/**', '**/playwright-report/**'] },
    },
  });
  await server.listen();
  process.on('SIGTERM', () => void server.close().then(() => process.exit(0)));
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
