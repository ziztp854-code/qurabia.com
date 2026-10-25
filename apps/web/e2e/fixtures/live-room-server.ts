// Loopback-only synthetic presentation fixture. No database or deployed service.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyVoiceEvent, voiceSnapshot } from '../../src/lib/voice/room-state';
import { voiceEventSchema } from '../../src/lib/voice/schemas';
import type { VoiceRoomState } from '../../src/lib/voice/types';
import type { VoiceParticipant, VoiceSnapshot } from '../../src/lib/voice/types';
async function main() {
  if (process.env.LIVE_ROOM_E2E !== '1') throw Error('Set LIVE_ROOM_E2E=1');
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const viteRequire = createRequire(require.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
  const { default: react } = await import(
    pathToFileURL(require.resolve('@vitejs/plugin-react')).href
  );
  const effectsPreview = process.env.VOICE_EFFECTS_PREVIEW === '1';
  const effectsBaseline = process.env.VOICE_EFFECTS_BASELINE === '1';
  const port = effectsBaseline ? 3419 : effectsPreview ? 3418 : 3417;
  const at = effectsPreview ? Date.now() : 1792500000000;
  const participants: VoiceParticipant[] = [
    'عبدالعزيز بن سلطان',
    'نورة',
    'محمد',
    'سارة',
    'سلطان',
    'خالد',
  ].map((name, i) => ({
    id: i ? `guest${i}` : 'host',
    name,
    image: null,
    accountNumber: i + 1,
    role: i ? 'listener' : 'host',
    seatIndex: i ? null : 0,
    handRaised: false,
    requestedSeat: null,
    muted: true,
    moderatorMuted: false,
    joinedAt: at,
    lastSeenAt: at,
  }));
  const snapshot: VoiceSnapshot = {
    room: {
      id: 'responsive-fixture',
      name: 'المجلس الملكي · تحدي لايف',
      description: 'مجلس السهر والحديث مع أصدقاء تحدي لايف',
      category: 'مجالس',
      cover: '/voice/covers/studio.webp',
      seatCount: 8,
      isPrivate: false,
      allowMicRequests: true,
      chatEnabled: true,
      moderatorsCanManage: true,
      hostId: 'host',
      hostName: participants[0].name,
      hostImage: null,
      createdAt: at,
      active: true,
      lockedSeats: [],
      participantCount: participants.length,
      listenerCount: participants.length - 1,
      speakers: [participants[0]],
      passwordRequired: false,
    },
    participants,
    me: participants[0],
    cursor: 1,
    messages: [
      'أهلًا بأهل المجلس! كيف كانت تحديات اليوم؟',
      'مساء النور، مستعدون لجولة جديدة ✨',
    ].map((text, i) => ({
      id: `m${i}`,
      userId: participants[i].id,
      name: participants[i].name,
      image: null,
      text,
      createdAt: at + i * 1000,
      replyTo: null,
      pinned: false,
      reactions: {},
    })),
  };
  if (effectsPreview) {
    participants[0].accountBadges = ['sultan'];
    participants[0].communityIdentity = {
      userId: 'host',
      username: 'host',
      name: participants[0].name,
      avatarUrl: null,
      accountNumber: 1,
      primaryBadge: null,
      badges: [],
      effect: null,
      frame: {
        id: 'frame-gold',
        name: 'ذهبي',
        tier: 'gold',
        assetUrl: null,
        description: 'إطار المعاينة',
        kind: 'FRAME',
        token: 'gold',
        archived: false,
        free: true,
      },
    } as VoiceParticipant['communityIdentity'];
    snapshot.room.name = 'معاينة المؤثرات · المجلس الملكي';
  }
  const previewState: VoiceRoomState = {
    settings: snapshot.room,
    host: participants[0],
    participants,
    messages: [...snapshot.messages],
    active: true,
    lockedSeats: [],
    createdAt: at,
    bannedUsers: [],
  };
  const receipts = new Set<string>();
  let revision = 1;
  const preferences = {
    favorites: [],
    following: [],
    history: [],
    blockedUsers: [],
    mutedUsers: [],
    privateProfile: false,
    notifyFavorites: true,
  };
  const middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1:3417');
    url.pathname = url.pathname.replace(/\/$/, '') || '/';
    if (effectsPreview && url.pathname === '/api/community/me') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: true,
          data: { settings: { entranceEnabled: true, reduceEffects: false } },
        }),
      );
      return;
    }
    if (
      effectsPreview &&
      /\/api\/voice\/rooms\/responsive-fixture(?:\/events|\/join)?$/.test(url.pathname)
    ) {
      const viewer =
        /(?:^|; )effects-viewer=(guest[1-5])/.exec(req.headers.cookie ?? '')?.[1] ?? 'host';
      const respond = () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(voiceSnapshot('responsive-fixture', previewState, revision, viewer)),
        );
      };
      if (req.method === 'POST' && url.pathname.endsWith('/events')) {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const command = voiceEventSchema.parse(JSON.parse(body));
            const key = 'requestId' in command ? `${viewer}:${command.requestId}` : null;
            if (!key || !receipts.has(key)) {
              applyVoiceEvent(previewState, viewer, command, Date.now(), crypto.randomUUID());
              if (key) receipts.add(key);
              revision++;
            }
            respond();
          } catch (error) {
            res.statusCode = 429;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({ error: error instanceof Error ? error.message : 'تعذر الإرسال' }),
            );
          }
        });
      } else respond();
      return;
    }
    if (url.pathname.startsWith('/api/voice/')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify(
          url.pathname.endsWith('/preferences')
            ? preferences
            : url.pathname.includes('/social')
              ? { contacts: [] }
              : snapshot,
        ),
      );
      return;
    }
    if (url.pathname === '/') {
      if (effectsPreview)
        res.setHeader(
          'Set-Cookie',
          `effects-viewer=${/^guest[1-5]$/.test(url.searchParams.get('viewer') ?? '') ? url.searchParams.get('viewer') : 'host'}; Path=/; SameSite=Strict`,
        );
      res.setHeader('Content-Type', 'text/html');
      void server
        .transformIndexHtml(
          '/',
          '<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><head><title>Voice room local presentation fixture</title><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/live-room-harness.tsx"></script></body></html>',
        )
        .then((html: string) => res.end(html));
      return;
    }
    next();
  };
  const server = await createServer({
    configFile: false,
    cacheDir: path.join(process.cwd(), `node_modules/.vite-live-room-${port}`),
    root: process.cwd(),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    plugins: [
      {
        // An explicit baseline run reads immutable tracked presentation source;
        // concurrent polishing can continue without changing the before evidence.
        name: 'voice-polish-immutable-baseline',
        enforce: 'pre',
        load(id: string) {
          if (!effectsBaseline && process.env.VOICE_POLISH_STAGE !== 'before') return null;
          const relative = path
            .relative(path.resolve(process.cwd(), '../..'), id.split('?')[0])
            .replaceAll('\\', '/');
          if (
            !relative.startsWith('apps/web/src/components/voice/') &&
            relative !== 'apps/web/src/app/voice/voice.css'
          )
            return null;
          if (!/\.(css|ts|tsx)$/.test(relative)) return null;
          return execFileSync(
            'git',
            [
              'show',
              `${effectsBaseline ? 'HEAD' : '9132ff95c4db2fa7809e434adae59a111013be9d'}:${relative}`,
            ],
            {
              cwd: path.resolve(process.cwd(), '../..'),
              encoding: 'utf8',
            },
          );
        },
      },
      {
        name: 'live-room-adapters',
        enforce: 'pre',
        resolveId(id: string) {
          return id === './audio-session' || id === 'next/navigation'
            ? path.join(process.cwd(), 'e2e/fixtures/live-room-adapters.tsx')
            : null;
        },
      },
      react(),
      {
        name: 'live-room-fixture',
        configureServer(vite: { middlewares: { use: (handler: typeof middleware) => void } }) {
          vite.middlewares.use(middleware);
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.join(process.cwd(), 'src'),
        'next/link': path.join(process.cwd(), 'e2e/fixtures/community-next-link.tsx'),
        'next/image': path.join(process.cwd(), 'e2e/fixtures/community-next-image.tsx'),
      },
    },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'development' }) },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      watch: {
        ignored: [
          '**/.next/**',
          '**/test-results/**',
          '**/playwright-report/**',
          '**/docs/visual-evidence/**',
        ],
      },
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
