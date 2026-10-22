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
  process.env.AUTH_SECRET ||= randomUUID() + randomUUID();
  const webDir = path.resolve(process.cwd(), process.cwd().endsWith('/apps/web') ? '.' : 'apps/web');
  // Next's workflow plugin discovers src/app from cwd, independently of next({ dir }).
  // Match the web app's normal pnpm dev working directory without changing its config.
  process.chdir(webDir);
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
  type Phase = 'database_create' | 'next_prepare' | 'backend_listen' | 'proxy_listen' | 'route_warmup' | 'ready';
  let phase: Phase = 'database_create';
  function mark(nextPhase: Phase) {
    phase = nextPhase;
    console.log('MOBILE_LOGIN_FIXTURE_PHASE:' + phase);
  }
  const evidence = {
    csrf_ok: 0, credentials_ok: 0, credentials_rejected: 0,
    authenticated_sessions: 0, anonymous_sessions: 0, foreign_sessions: 0,
    signout_ok: 0, rooms_ok: 0,
  };
  const createEvidence = {
    room_create_attempts: 0, room_create_response_status: 0, room_create_server_errors: 0,
  };
  const hostEvidence = {
    room_create_ok: 0, room_close_ok: 0,
    leave_while_active: 0, signout_while_active: 0,
  };
  async function ownedRoomState() {
    const records = await db.voiceRoom.findMany({
      where: { hostId: id }, select: { active: true, state: true },
    });
    const counts = {
      owned_rooms: records.length, active_rooms: 0, closed_rooms: 0,
      closed_with_members: 0, inconsistent_rooms: 0,
    };
    for (const record of records) {
      const state = record.state as { active?: boolean; participants?: unknown[] };
      if (record.active !== state?.active) counts.inconsistent_rooms++;
      if (record.active) counts.active_rooms++;
      else {
        counts.closed_rooms++;
        if (!Array.isArray(state?.participants) || state.participants.length !== 0)
          counts.closed_with_members++;
      }
    }
    return { ...hostEvidence, ...counts };
  }
  async function observeHostRequest(pathname: string, method: string | undefined) {
    if (method !== 'POST') return;
    const canonical = pathname.replace(/\/$/, '');
    if (canonical === '/api/voice/rooms') createEvidence.room_create_attempts++;
    if (canonical === '/api/auth/signout' && (
        hostEvidence.room_create_ok > hostEvidence.room_close_ok ||
        await db.voiceRoom.count({ where: { hostId: id, active: true } })))
      hostEvidence.signout_while_active++;
    const leave = canonical.match(/^\/api\/voice\/rooms\/([^/]+)\/leave$/);
    if (leave && await db.voiceRoom.count({
      where: { id: decodeURIComponent(leave[1]), hostId: id, active: true },
    })) hostEvidence.leave_while_active++;
  }
  async function observeHostResponse(
    pathname: string, method: string | undefined, status: number, body: Buffer,
    eventType: string | undefined,
  ) {
    const canonical = pathname.replace(/\/$/, '');
    if (method !== 'POST') return;
    if (status !== 200 && status !== 201) return;
    if (canonical !== '/api/voice/rooms' && eventType !== 'close') return;
    let snapshot: { room?: { id?: string; hostId?: string; active?: boolean };
      participants?: unknown[] };
    try { snapshot = JSON.parse(body.toString()); } catch { return; }
    const roomId = snapshot.room?.id;
    if (!roomId || snapshot.room?.hostId !== id) return;
    const owned = await db.voiceRoom.findFirst({ where: { id: roomId, hostId: id } });
    if (!owned) return;
    if (canonical === '/api/voice/rooms' && status === 201 && owned.active)
      hostEvidence.room_create_ok++;
    if (canonical === '/api/voice/rooms/' + encodeURIComponent(roomId) + '/events' &&
        eventType === 'close' && status === 200 && !owned.active &&
        snapshot.room?.active === false && Array.isArray(snapshot.participants) &&
        snapshot.participants.length === 0)
      hostEvidence.room_close_ok++;
  }
  async function cleanup() {
    if (closing) return;
    closing = true;
    if (ownsCredentialsFile) await fs.rm(credentialsFile, { force: true });
    proxy?.closeAllConnections(); backend?.closeAllConnections();
    await Promise.all([proxy && new Promise<void>(r => proxy!.close(() => r())),
      backend && new Promise<void>(r => backend!.close(() => r()))]);
    await app?.close();
    await db.voiceRoom.deleteMany({ where: { hostId: id } });
    await db.user.deleteMany({ where: { id } });
    await db.$disconnect();
  }
  process.once('SIGTERM', () => { void cleanup().finally(() => process.exit(0)); });
  process.once('SIGINT', () => { void cleanup().finally(() => process.exit(0)); });
  try {
    mark('database_create');
    await db.user.create({ data: {
      id, email, name: 'اختبار دخول أندرويد', passwordHash: await hashPassword(password),
      role: 'USER', status: 'ACTIVE',
    } });
    mark('next_prepare');
    app = next({ dev: true, dir: webDir, hostname: 'localhost', port: 3000, webpack: true });
    await app.prepare();
    const handler = app.getRequestHandler();
    backend = http.createServer((req, res) => { void handler(req, res); });
    mark('backend_listen');
    await new Promise<void>((resolve, reject) => {
      backend!.once('error', reject);
      backend!.listen(3000, '127.0.0.1', resolve);
    });
    proxy = https.createServer({
      cert: await fs.readFile(certFile), key: await fs.readFile(keyFile),
    }, async (req, res) => {
      const pathname = (req.url || '').split('?')[0];
      if (pathname === '/__mobile_login_evidence' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(evidence)); return;
      }
      if (pathname === '/__mobile_create_evidence' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(createEvidence)); return;
      }
      if (pathname === '/__mobile_host_evidence' && req.method === 'GET') {
        void ownedRoomState().then(value => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(value));
        }).catch(() => { res.writeHead(503); res.end(); });
        return;
      }
      if (!pathname.startsWith('/api/')) { res.writeHead(404); res.end(); return; }
      // Audit before forwarding: host close must be confirmed before leave/signout.
      try { await observeHostRequest(pathname, req.method); }
      catch { res.writeHead(503); res.end(); return; }
      // Only event command bodies are inspected, in memory, to distinguish close.
      // Credentials/cookies/tokens and room IDs never enter the evidence payload.
      const eventChunks: Buffer[] = [];
      let eventBytes = 0;
      if (req.method === 'POST' && /^\/api\/voice\/rooms\/[^/]+\/events\/?$/.test(pathname))
        req.on('data', chunk => {
          eventBytes += chunk.length;
          if (eventBytes <= 65_536) eventChunks.push(chunk);
        });
      const upstream = http.request({
        hostname: '127.0.0.1', port: 3000, path: req.url, method: req.method,
        headers: { ...req.headers, 'accept-encoding': 'identity', host: 'localhost:3443',
          'x-forwarded-host': 'localhost:3443', 'x-forwarded-proto': 'https' },
      }, response => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 2_097_152) { response.destroy(); res.destroy(); return; }
          chunks.push(chunk);
        });
        response.on('end', async () => {
          const body = Buffer.concat(chunks), status = response.statusCode || 502;
          const canonical = pathname.replace(/\/$/, '');
          if (req.method === 'POST' && canonical === '/api/voice/rooms') {
            createEvidence.room_create_response_status = status;
            if (status >= 500) createEvidence.room_create_server_errors++;
          }
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
          try {
            let eventType: string | undefined;
            if (eventChunks.length && eventBytes <= 65_536) {
              try { eventType = JSON.parse(Buffer.concat(eventChunks).toString()).type; }
              catch { eventType = undefined; }
            }
            await observeHostResponse(pathname, req.method, status, body, eventType);
          } catch {
            // A failed independent DB audit must not be recorded as a successful close.
            res.writeHead(502); res.end(); return;
          }
          if (res.destroyed) return;
          res.writeHead(status, response.headers); res.end(body);
        });
        response.on('error', () => { res.destroy(); });
      });
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.pipe(upstream);
    });
    mark('proxy_listen');
    await new Promise<void>((resolve, reject) => {
      proxy!.once('error', reject); proxy!.listen(3443, '127.0.0.1', resolve);
    });
    // Warm the real route compiler before the native client's 15-second GET timeout.
    mark('route_warmup');
    for (const endpoint of ['/api/auth/csrf/', '/api/auth/session/', '/api/voice/rooms/',
      '/api/voice/rooms/qa-warmup/events/']) {
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
    mark('ready');
  } catch {
    console.error('MOBILE_LOGIN_FIXTURE_FAILED:' + phase);
    await cleanup();
    throw new Error('Isolated login fixture initialization failed; private server log is not an artifact');
  }
}
main().catch(() => { console.error('Isolated login fixture failed'); process.exitCode = 1; });
