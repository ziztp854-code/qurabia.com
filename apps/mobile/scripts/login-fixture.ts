/** Isolated real NextAuth fixture. Never point this process at a deployed DB. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { hashPassword } from '../../web/src/lib/auth/password';

async function main() {
  const args = process.argv.slice(2);
  function arg(name: string) {
    const index = args.indexOf(name);
    if (index < 0 || !args[index + 1]) throw new Error('Missing fixture option');
    return path.resolve(args[index + 1]);
  }
  const credentialsFile = arg('--credentials'), certFile = arg('--cert'), keyFile = arg('--key');
  const databaseUrl = process.env.MOBILE_LOGIN_TEST_DATABASE_URL || '';
  const database = new URL(databaseUrl);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
      database.pathname !== '/mobile_login_test' ||
      !['postgres:', 'postgresql:'].includes(database.protocol) ||
      process.env.DATABASE_URL !== databaseUrl)
    throw new Error('Only the isolated local mobile_login_test database is allowed');
  if (process.env.VITEST !== '1' || process.env.NODE_ENV === 'production' ||
      process.env.VERCEL || process.env.NEXTAUTH_URL !== 'https://localhost:3443' ||
      process.env.AUTH_URL !== 'https://localhost:3443' || !process.env.NODE_EXTRA_CA_CERTS)
    throw new Error('Set explicit local HTTPS development fixture configuration');
  // Use development limiter policy intentionally. Password hashing, NextAuth CSRF,
  // JWT signing, session validation and database access are the real implementations.
  const webDir = path.resolve(process.cwd(), process.cwd().endsWith('/apps/web') ? '.' : 'apps/web');
  const requireWeb = createRequire(path.join(webDir, 'package.json'));
  const next = requireWeb('next');
  const { createPrismaClient } = requireWeb('@tahaddi/database');
  const db = createPrismaClient(databaseUrl);
  const id = 'mobile_login_' + randomUUID();
  const email = id + '+ci@example.test';
  // Form encoding must round-trip +, %, = and & through the actual native client.
  const password = 'MobileAa42!+%25=&' + randomUUID();
  let app: any, backend: http.Server | undefined, proxy: https.Server | undefined;
  let closing = false, ownsCredentialsFile = false;
  const evidence = {
    csrf_ok: 0, credentials_ok: 0, credentials_rejected: 0,
    authenticated_sessions: 0, anonymous_sessions: 0, foreign_sessions: 0,
    signout_ok: 0, rooms_ok: 0,
  };
  async function cleanup() {
    if (closing) return;
    closing = true;
    if (ownsCredentialsFile) await fs.rm(credentialsFile, { force: true });
    proxy?.closeAllConnections(); backend?.closeAllConnections();
    await Promise.all([proxy && new Promise<void>(r => proxy!.close(() => r())),
      backend && new Promise<void>(r => backend!.close(() => r()))]);
    await app?.close();
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
  process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void cleanup().finally(() => process.exit(0)); });
  try {
    await db.user.create({ data: {
      id, email, name: 'اختبار دخول أندرويد', passwordHash: await hashPassword(password),
      role: 'USER', status: 'ACTIVE',
    } });
    app = next({ dev: true, dir: webDir, hostname: 'localhost', port: 3000, webpack: true });
    await app.prepare();
    const handler = app.getRequestHandler();
    backend = http.createServer((req, res) => { void handler(req, res); });
    await new Promise<void>((resolve, reject) => {
      backend!.once('error', reject);
      backend!.listen(3000, '127.0.0.1', resolve);
    });
    proxy = https.createServer({
      cert: await fs.readFile(certFile), key: await fs.readFile(keyFile),
    }, (req, res) => {
      const pathname = (req.url || '').split('?')[0];
      if (pathname === '/__mobile_login_evidence' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(evidence)); return;
      }
      if (!pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
      const upstream = http.request({
        hostname: '127.0.0.1', port: 3000, path: req.url, method: req.method,
        headers: { ...req.headers, host: 'localhost:3443',
          'x-forwarded-host': 'localhost:3443', 'x-forwarded-proto': 'https' },
      }, response => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 2_097_152) { response.destroy(); res.destroy(); return; }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks), status = response.statusCode || 502;
          const canonical = pathname.replace(/\/$/, '');
          if (status === 200) {
            if (canonical === '/api/auth/csrf') evidence.csrf_ok++;
            if (canonical === '/api/auth/callback/credentials') evidence.credentials_ok++;
            if (canonical === '/api/auth/signout') evidence.signout_ok++;
            if (canonical === '/api/voice/rooms') evidence.rooms_ok++;
            if (canonical === '/api/auth/session') {
              try {
                const session = JSON.parse(body.toString());
                if (session?.user?.id === id) evidence.authenticated_sessions++;
                else if (session?.user) evidence.foreign_sessions++;
                else if (session && typeof session === 'object' && !Array.isArray(session) &&
                    Object.keys(session).length === 0) evidence.anonymous_sessions++;
              } catch { /* malformed response is never counted as success */ }
            }
          } else if (canonical === '/api/auth/callback/credentials') evidence.credentials_rejected++;
          res.writeHead(status, response.headers); res.end(body);
        });
        response.on('error', () => { res.destroy(); });
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    await new Promise<void>((resolve, reject) => {
      proxy!.once('error', reject); proxy!.listen(3443, '127.0.0.1', resolve);
    });
    // Warm the real route compiler before the native client's 15-second GET timeout.
    for (const endpoint of ['/api/auth/csrf/', '/api/auth/session/', '/api/voice/rooms/']) {
      await new Promise<void>((resolve, reject) => {
        const request = https.get('https://localhost:3443' + endpoint, { family: 4 }, response => {
          response.resume();
          response.on('end', () => [200, 401].includes(response.statusCode || 0)
            ? resolve() : reject(new Error('Fixture warmup failed')));
        });
        request.on('error', reject);
        request.setTimeout(120_000, () => request.destroy(new Error('Fixture warmup timeout')));
      });
    }
    await fs.mkdir(path.dirname(credentialsFile), { recursive: true });
    await fs.writeFile(credentialsFile, JSON.stringify({ origin: 'https://localhost:3443', email, password }),
      { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    ownsCredentialsFile = true;
    await fs.chmod(credentialsFile, 0o600);
    console.log('MOBILE_LOGIN_FIXTURE_READY (local HTTPS; development limiter; real NextAuth/database)');
  } catch {
    await cleanup();
    throw new Error('Isolated login fixture initialization failed; private server log is not an artifact');
  }
}
main().catch(() => { console.error('Isolated login fixture failed'); process.exitCode = 1; });
