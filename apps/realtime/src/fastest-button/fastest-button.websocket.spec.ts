import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import Redis from 'ioredis';
import {
  createFastestButtonHostAccessToken,
  type FastestButtonSnapshot,
} from '@tahaddi/contracts';
import { FastestButtonGateway } from './fastest-button.gateway';
import { FastestButtonService } from './fastest-button.service';
import { RedisService } from '../game/redis.service';
const enabled = process.env.FASTEST_TEST_REDIS_URL;
const integration = enabled ? describe : describe.skip;
const secret = 'fastest-button-websocket-test-secret';
function event<T>(
  socket: Socket,
  name: string,
  predicate: (value: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out: ${name}`));
    }, 8000);
    function listener(value: T) {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.off(name, listener);
      resolve(value);
    }
    socket.on(name, listener);
  });
}
integration('Fastest Button real multiplayer sockets', () => {
  let app: INestApplication;
  let base: string;
  const sockets: Socket[] = [];
  let code: string;
  let cleanup: Redis;
  const originalOrigin = process.env.WEB_ORIGIN;
  beforeAll(async () => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    const module = await Test.createTestingModule({
      providers: [
        FastestButtonGateway,
        FastestButtonService,
        RedisService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            REDIS_URL: enabled,
            AUTH_SECRET: secret,
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()) + '/fastest-button';
    cleanup = new Redis(enabled!);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await new Promise((r) => setTimeout(r, 100));
    await app.close();
    if (code) {
      await cleanup.del(`fastest:room:${code}`);
      await cleanup.zrem('fastest:deadlines', code);
    }
    await cleanup.quit();
    if (originalOrigin === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = originalOrigin;
  });
  async function client(host = false) {
    const socket = io(base, {
      transports: ['websocket'],
      forceNew: true,
      extraHeaders: { Origin: 'http://localhost:3000' },
      auth: host
        ? {
            hostToken: createFastestButtonHostAccessToken(secret, {
              hostId: 'host',
              expiresAt: Date.now() + 60000,
            }),
          }
        : {},
    });
    sockets.push(socket);
    await event(socket, 'connect');
    return socket;
  }
  it('broadcasts one winner to every role and restores the same disconnected participant', async () => {
    const host = await client(true);
    let state = event<FastestButtonSnapshot>(host, 'fastest:state');
    host.emit('fastest:create', {
      mode: 'classic',
      countdownSeconds: 2,
      responseSeconds: 5,
      totalRounds: 1,
    });
    code = (await state).code;
    const player = await client();
    const player2 = await client();
    const identity = event<{ code: string; playerId: string; token: string }>(
      player,
      'fastest:identity',
    );
    player.emit('fastest:join', { code, name: 'سريع' });
    const session = await identity;
    const joined = event<FastestButtonSnapshot>(
      host,
      'fastest:state',
      (r) => r.players.length === 2,
    );
    player2.emit('fastest:join', { code, name: 'منافس' });
    await joined;
    const display = await client();
    state = event<FastestButtonSnapshot>(display, 'fastest:state');
    display.emit('fastest:watch', { code });
    const publicState = await state;
    expect(JSON.stringify(publicState)).not.toContain('hostId');
    expect(JSON.stringify(publicState)).not.toContain(session.token);
    const forbidden = event<{ code: string }>(display, 'fastest:error');
    display.emit('fastest:command', { code, action: 'start' });
    expect((await forbidden).code).toBe('HOST_AUTH_REQUIRED');
    const active = event<FastestButtonSnapshot>(
      player,
      'fastest:state',
      (r) => r.phase === 'active',
    );
    host.emit('fastest:command', { code, action: 'start' });
    const round = (await active).round!;
    const views = [host, player, player2, display].map((s) =>
      event<FastestButtonSnapshot>(
        s,
        'fastest:state',
        (r) => r.phase === 'results' && r.rounds.length === 1,
      ),
    );
    player.emit('fastest:press', { code, roundId: round.id });
    for (const result of await Promise.all(views))
      expect(result.round?.winnerId).toBe(session.playerId);
    player.disconnect();
    const restored = await client();
    const recovered = event<FastestButtonSnapshot>(
      restored,
      'fastest:state',
      (r) => r.players.some((p) => p.id === session.playerId && p.connected),
    );
    restored.emit('fastest:resume', { code, token: session.token });
    const resumed = await recovered;
    expect(resumed.players).toHaveLength(2);
    expect(resumed.round?.winnerId).toBe(session.playerId);
    const next = event<FastestButtonSnapshot>(
      host,
      'fastest:state',
      (r) => r.phase === 'countdown' && r.round?.number === 2,
    );
    host.emit('fastest:command', { code, action: 'start' });
    expect((await next).code).toBe(code);
  }, 20000);
});
