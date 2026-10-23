// Loopback-only synthetic presentation fixture. No database or deployed service.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VoiceParticipant, VoiceSnapshot } from '../../src/lib/voice/types';
async function main() {
  if (process.env.LIVE_ROOM_E2E !== '1') throw Error('Set LIVE_ROOM_E2E=1');
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  const viteRequire = createRequire(require.resolve('vitest/package.json'));
  const { createServer } = await import(pathToFileURL(viteRequire.resolve('vite')).href);
  const { default: react } = await import(
    pathToFileURL(require.resolve('@vitejs/plugin-react')).href
  );
  const at = 1792500000000;
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
    const url = new URL(req.url || '/', 'http://127.0.0.1:3418');
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
      res.setHeader('Content-Type', 'text/html');
      void server
        .transformIndexHtml(
          '/',
          '<!doctype html><html lang="ar" dir="rtl" data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/chat-typing-harness.tsx"></script></body></html>',
        )
        .then((html: string) => res.end(html));
      return;
    }
    next();
  };
  const server = await createServer({
    configFile: false,
    cacheDir: path.join(process.cwd(), 'node_modules/.vite-chat-typing'),
    root: process.cwd(),
    envDir: path.join(process.cwd(), 'e2e/fixtures'),
    plugins: [
      {
        name: 'live-room-adapters',
        enforce: 'pre',
        resolveId(id: string) {
          return id === './audio-session' || id === 'next/navigation'
            ? path.join(process.cwd(), 'e2e/fixtures/live-room-adapters.tsx')
            : null;
        },
      },
      {
        name: 'chat-typing-test-only-render-probes',
        enforce: 'pre',
        transform(code: string, id: string) {
          if (!id.endsWith('.tsx') || !id.includes('/src/components/voice/')) return null;
          let result = code;
          for (const name of [
            'VoiceChat',
            'VoiceChatComposer',
            'ChatComposer',
            'ChatMessageRow',
            'VoiceRoomView',
            'Avatar',
            'MemberName',
          ]) {
            const start = result.indexOf(`function ${name}(`);
            if (start < 0) continue;
            const end = result.indexOf(') {', start);
            if (end < 0) continue;
            const at = end + 3;
            result =
              result.slice(0, at) +
              `\n(window as any).__typingRender?.('${name}');\n` +
              result.slice(at);
          }
          // Before extraction: inline message JSX evaluations. After extraction: count the
          // actual ChatMessageRow function above, never memo wrapper/map attempts.
          if (id.endsWith('/voice-chat.tsx') && !code.includes('function ChatMessageRow('))
            result = result.replaceAll(
              '<article',
              "<article {...((window as any).__typingRender?.('MessageRow'), {})}",
            );
          return { code: result, map: null };
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
      port: 3418,
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
