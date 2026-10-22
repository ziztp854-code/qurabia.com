// Loopback-only synthetic presentation fixture; no database or credentials.
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
async function main() {
  if (process.env.TAHADDI_SURFACES_E2E !== '1') throw Error('Set TAHADDI_SURFACES_E2E=1');
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
    plugins: [
      react(),
      {
        name: 'tahaddi-surfaces-fixture',
        configureServer(vite: {
          middlewares: {
            use: (
              handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void,
            ) => void;
          };
        }) {
          vite.middlewares.use((req, res, next) => {
            if (new URL(req.url || '/', 'http://127.0.0.1').pathname !== '/') return next();
            res.setHeader('Content-Type', 'text/html');
            void server
              .transformIndexHtml(
                '/',
                '<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/tahaddi-surfaces-harness.tsx"></script></body></html>',
              )
              .then((html: string) => res.end(html));
          });
        },
      },
    ],
    resolve: {
      alias: [
        {
          find: '@/components/layout',
          replacement: path.join(process.cwd(), 'e2e/fixtures/tahaddi-surfaces-layout.tsx'),
        },
        { find: '@', replacement: path.join(process.cwd(), 'src') },
        {
          find: 'next/link',
          replacement: path.join(process.cwd(), 'e2e/fixtures/community-next-link.tsx'),
        },
        {
          find: 'next/image',
          replacement: path.join(process.cwd(), 'e2e/fixtures/community-next-image.tsx'),
        },
        {
          find: 'next/navigation',
          replacement: path.join(process.cwd(), 'e2e/fixtures/live-room-adapters.tsx'),
        },
      ],
    },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: {
      host: '127.0.0.1',
      port: 3421,
      strictPort: true,
      watch: { ignored: ['**/.next/**', '**/test-results/**', '**/docs/visual-evidence/**'] },
    },
  });
  await server.listen();
  process.on('SIGTERM', () => {
    void server.close().then(() => process.exit(0));
  });
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
