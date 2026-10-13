// Local-only browser fixture: production report repository and isolated PostgreSQL.
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
type LocalServer = {
  middlewares: {
    use(
      handler: (request: IncomingMessage, response: ServerResponse, next: () => void) => void,
    ): void;
  };
  transformIndexHtml(url: string, html: string): Promise<string>;
};
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPrismaClient, Prisma } from '@tahaddi/database';
import { createWorld, executeCommand, projectWorld } from '../../src/lib/kingdoms/engine';
import { report, emptyTroops } from '../../src/lib/kingdoms/simulation';
import { resources } from '../../src/lib/kingdoms/config';
import { archiveKingdomReports } from '../../src/lib/kingdoms/reports-store';
import {
  listRoyalReports,
  readRoyalReport,
  markRoyalReportRead,
} from '../../src/lib/kingdoms/reports-repository';
async function main() {
  const url = new URL(process.env.KINGDOMS_TEST_DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/kingdoms_test_reports'
  )
    throw Error('Isolated local DB required');
  const db = createPrismaClient(url.href);
  const identity = { id: `browser_reports_${randomUUID()}`, tokenVersion: 0 };
  await db.user.create({ data: { id: identity.id, name: 'سلطان الياقوت' } });
  const at = Date.now();
  const world = executeCommand(
    createWorld(at),
    identity.id,
    { type: 'found', name: 'مملكة الياقوت' },
    at,
  );
  const village = Object.values(world.villages)[0];
  for (let n = 0; n < 125; n++)
    report(
      world,
      at + n,
      [identity.id],
      'اكتمل البناء',
      `ارتفع مستوى ${n % 2 ? 'المخزن' : 'المزرعة'} وبدأ عهد جديد من ازدهار المملكة.`,
      {
        event: {
          key: 'building.completed',
          category: 'buildings',
          construction: { building: 'farm', from: 1, to: 2 },
          location: { villageId: village.id, name: village.name, x: village.x, y: village.y },
        },
      },
    );
  report(
    world,
    at + 200,
    [identity.id],
    'اكتملت التجارة',
    'وصلت الموارد المتبادلة إلى خزائن المملكة بأمان.',
    {
      event: {
        key: 'trade.completed',
        category: 'economy',
        resources: { sent: resources(120, 60, 20, 30, 0), received: resources(0, 100, 80, 90, 25) },
      },
    },
  );
  report(world, at + 300, [identity.id], 'عهد التحالف', 'أُبرم عهد التعاون بين المملكتين.', {
    event: { key: 'alliance.joined', category: 'diplomacy' },
  });
  report(
    world,
    at + 400,
    [identity.id],
    'انتصار عند بوابة الياقوت',
    'عادت الرايات مرفوعة بعدما صدّ الجيش الهجوم وحافظ على حدود المملكة.',
    {
      combat: {
        attack: 1300,
        defense: 600,
        attackerBefore: { ...emptyTroops(), guard: 120, rider: 30 },
        attackerAfter: { ...emptyTroops(), guard: 90, rider: 20 },
        defenderBefore: { ...emptyTroops(), guard: 60 },
        defenderAfter: emptyTroops(),
        loot: resources(480, 240, 120, 160, 35),
      },
      event: {
        key: 'battle.resolved',
        category: 'military',
        outcome: 'victory',
        attackerId: identity.id,
        location: { villageId: village.id, name: village.name, x: village.x, y: village.y },
        parties: [
          { role: 'attacker', name: 'مملكة الياقوت' },
          { role: 'defender', name: 'مملكة النخيل' },
        ],
        timeline: [
          { at, text: 'انطلقت القوات نحو بوابة المملكة.' },
          { at: at + 400, text: 'حُسمت المواجهة وعادت القوات بالغنائم.' },
        ],
      },
    },
  );
  const row = await db.kingdomWorld.create({
    data: {
      name: 'عالم المراجعة المحلي',
      state: JSON.parse(JSON.stringify(world)) as Prisma.InputJsonValue,
    },
  });
  await db.$transaction(async (tx) => {
    await archiveKingdomReports(tx, row, world);
    await tx.kingdomWorld.update({ where: { id: row.id }, data: { reportsArchived: true } });
  });
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  const vr = createRequire(req.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(vr.resolve('vite')).href);
  const { default: react } = await import(pathToFileURL(req.resolve('@vitejs/plugin-react')).href);
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    plugins: [
      react(),
      {
        name: 'royal-local',
        configureServer(server: LocalServer) {
          server.middlewares.use(
            async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
              const u = new URL(request.url ?? '/', 'http://127.0.0.1:3315');
              const reply = (data: unknown, status = 200) => {
                response.statusCode = status;
                response.setHeader('Content-Type', 'application/json');
                response.end(JSON.stringify({ success: status === 200, data }));
              };
              try {
                if (u.pathname === '/api/kingdoms') {
                  reply({
                    ...projectWorld(world, identity.id, at),
                    worldId: row.id,
                    worldName: row.name,
                    revision: 0,
                    paused: false,
                  });
                  return;
                }
                if (u.pathname === '/api/kingdoms/reports') {
                  if (request.method === 'PATCH') {
                    let body = '';
                    for await (const chunk of request) body += chunk;
                    reply(await markRoyalReportRead(JSON.parse(body), identity, db));
                  } else
                    reply(await listRoyalReports(Object.fromEntries(u.searchParams), identity, db));
                  return;
                }
                if (u.pathname.startsWith('/api/kingdoms/reports/')) {
                  reply(await readRoyalReport(row.id, u.pathname.split('/').at(-1)!, identity, db));
                  return;
                }
                if (u.pathname === '/') {
                  response.setHeader('Content-Type', 'text/html');
                  response.end(
                    await server.transformIndexHtml(
                      '/',
                      '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/royal-reports-harness.tsx"></script></body></html>',
                    ),
                  );
                  return;
                }
                next();
              } catch (e) {
                const error = e as Error & { status?: number };
                reply({ message: error.message }, error.status ?? 500);
              }
            },
          );
        },
      },
    ],
    resolve: { alias: { '@': path.join(process.cwd(), 'src') } },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: { host: '127.0.0.1', port: 3315, strictPort: true },
  });
  await server.listen();
  console.log('Royal Reports local database browser fixture: http://127.0.0.1:3315');
  const close = async () => {
    await server.close();
    await db.kingdomWorld.delete({ where: { id: row.id } });
    await db.user.delete({ where: { id: identity.id } });
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void close());
  process.on('SIGINT', () => void close());
}
void main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
