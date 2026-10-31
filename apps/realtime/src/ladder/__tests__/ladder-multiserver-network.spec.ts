import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLadderHostAccessToken } from '@tahaddi/contracts';
import { Server } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import { io, type Socket } from 'socket.io-client';
import { LadderGateway } from '../ladder.gateway.js';
import { LadderService } from '../ladder.service.js';
import { RedisService } from '../../game/redis.service.js';

const network =
  process.env.LADDER_NETWORK_TEST === '1' ? describe : describe.skip;
const secret = randomBytes(32).toString('hex');
const waitForRedisReady = (child: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`Redis did not start: ${output}`)),
      5000,
    );
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Redis exited before readiness (${code}): ${output}`));
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (/ready to accept connections/i.test(output)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
  });
const waitEvent = <T>(socket: Socket, event: string) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      5000,
    );
    socket.once(event, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

network('ladder across two realtime servers', () => {
  it('delivers current and private player snapshots to both instances without sync', async () => {
    const portServer = createServer();
    await new Promise<void>((resolve) =>
      portServer.listen(0, '127.0.0.1', resolve),
    );
    const address = portServer.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const redisPort = address.port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
    const directory = mkdtempSync(join(tmpdir(), 'ladder-two-servers-'));
    const redisProcess = spawn(
      process.env.LADDER_REDIS_BINARY || 'redis-server',
      [
        '--port',
        String(redisPort),
        '--bind',
        '127.0.0.1',
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const redisUrl = `redis://127.0.0.1:${redisPort}`;
    const config = {
      get: (key: string) => (key === 'REDIS_URL' ? redisUrl : secret),
    };
    const stores: RedisService[] = [];
    const services: LadderService[] = [];
    const adapters: Redis[] = [];
    const servers: Server[] = [];
    const gateways: LadderGateway[] = [];
    const clients: Socket[] = [];
    const disconnects: Promise<void>[] = [];
    try {
      await waitForRedisReady(redisProcess);
      const questions = Array.from({ length: 12 }, (_, i) => ({
        id: `q${i}`,
        prompt: `ما هو السؤال رقم ${i}؟`,
        type: 'TRUE_FALSE',
        difficulty: 'EASY',
        timeLimit: 20,
        category: { id: 'general', name: 'عام' },
        options: [
          { id: `q${i}-a`, text: 'صحيح', isCorrect: true },
          { id: `q${i}-b`, text: 'خطأ', isCorrect: false },
        ],
      }));
      const database = {
        client: {
          question: {
            findMany: ({ where }: { where: { id?: { notIn: string[] } } }) =>
              Promise.resolve(
                questions.filter((q) => !where.id?.notIn.includes(q.id)),
              ),
          },
        },
      };
      const urls: string[] = [];
      for (let i = 0; i < 2; i++) {
        const redis = new RedisService(config as never);
        redis.onModuleInit();
        stores.push(redis);
        const service = new LadderService(redis, database as never);
        services.push(service);
        const gateway = new LadderGateway(service, redis, config as never);
        gateways.push(gateway);
        const adapter = new Redis(redisUrl, { maxRetriesPerRequest: null });
        adapters.push(adapter);
        await adapter.ping();
        const http = createServer();
        const sockets = new Server(http);
        servers.push(sockets);
        sockets.adapter(
          createAdapter(adapter, {
            streamName: 'ladder:test:two-instances',
            blockTimeInMs: 100,
          }),
        );
        const namespace = sockets.of('/ladder');
        gateway.server = namespace as never;
        namespace.on('connection', (socket) => {
          socket.on(
            'ladder:host',
            (value) => void gateway.hostRoom(socket as never, value as never),
          );
          socket.on(
            'ladder:join',
            (value) => void gateway.joinRoom(socket as never, value as never),
          );
          socket.on(
            'ladder:reconnect',
            (value) => void gateway.reconnect(socket as never, value as never),
          );
          socket.on(
            'ladder:start',
            (value) => void gateway.startGame(socket as never, value as never),
          );
          socket.on(
            'ladder:answer',
            (value) =>
              void gateway.submitAnswer(socket as never, value as never),
          );
          socket.on('disconnect', () => {
            disconnects.push(gateway.handleDisconnect(socket as never));
          });
        });
        gateway.afterInit();
        await new Promise<void>((resolve) =>
          http.listen(0, '127.0.0.1', resolve),
        );
        const bound = http.address();
        if (!bound || typeof bound === 'string') throw new Error('no address');
        urls.push(`http://127.0.0.1:${bound.port}/ladder`);
      }
      const hostAuth = {
        hostId: 'host-test',
        hostAccessToken: createLadderHostAccessToken(secret, {
          hostId: 'host-test',
          expiresAt: Date.now() + 60_000,
        }),
      };
      const hostA = io(urls[0], { transports: ['websocket'], auth: hostAuth });
      const hostB = io(urls[1], { transports: ['websocket'], auth: hostAuth });
      const right = io(urls[0], {
        transports: ['websocket'],
        auth: {
          guestId: 'guest-right',
          guestToken: randomBytes(32).toString('hex'),
        },
      });
      const left = io(urls[1], {
        transports: ['websocket'],
        auth: {
          guestId: 'guest-left',
          guestToken: randomBytes(32).toString('hex'),
        },
      });
      clients.push(hostA, hostB, right, left);
      await Promise.all(clients.map((client) => waitEvent(client, 'connect')));
      const hosted = waitEvent<{ roomCode: string }>(
        hostA,
        'ladder:room:state',
      );
      hostA.emit('ladder:host', {});
      const { roomCode } = await hosted;
      const hostReady = waitEvent(hostB, 'ladder:room:state');
      hostB.emit('ladder:reconnect', { roomCode });
      await hostReady;
      const rightJoined = [hostA, hostB, right].map((client) =>
        waitEvent(client, 'ladder:room:state'),
      );
      right.emit('ladder:join', {
        roomCode,
        playerName: 'خالد',
        team: 'right',
      });
      await Promise.all(rightJoined);
      const leftJoined = clients.map((client) =>
        waitEvent(client, 'ladder:room:state'),
      );
      left.emit('ladder:join', { roomCode, playerName: 'فهد', team: 'left' });
      await Promise.all(leftJoined);
      type Snapshot = {
        currentQuestion: {
          id: string;
          options: Array<{ id: string; text: string }>;
        };
        myAnswer: string | null;
        answerStatus: { right: boolean; left: boolean };
        roundResult: null | { correctOptionId: string };
        currentRound: number;
        revision: number;
      };
      const started = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      const startedAt = Date.now();
      hostA.emit('ladder:start', { roomCode });
      const views = await Promise.all(started);
      expect(Date.now() - startedAt).toBeLessThan(3000);
      expect(new Set(views.map((view) => view.currentQuestion.id)).size).toBe(
        1,
      );
      expect(
        views.every(
          (view) =>
            !JSON.stringify(view).includes('isCorrect') &&
            !JSON.stringify(view).includes('correctOptionId'),
        ),
      ).toBe(true);
      const id = views[0].currentQuestion.id;
      const answered = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      right.emit('ladder:answer', {
        roomCode,
        questionId: id,
        optionId: `${id}-b`,
      });
      const answerViews = await Promise.all(answered);
      expect(answerViews[2].myAnswer).toBe(`${id}-b`);
      expect(
        [answerViews[0], answerViews[1], answerViews[3]].every(
          (view) => view.myAnswer === null && view.roundResult === null,
        ),
      ).toBe(true);
      expect(answerViews.every((view) => view.answerStatus.right)).toBe(true);
      const reveal = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      left.emit('ladder:answer', {
        roomCode,
        questionId: id,
        optionId: `${id}-a`,
      });
      const results = await Promise.all(reveal);
      expect(
        results.every(
          (view) => view.roundResult?.correctOptionId === `${id}-a`,
        ),
      ).toBe(true);
      const next = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      const secondQuestionViews = await Promise.all(next);
      expect(
        secondQuestionViews.every(
          (view) => view.currentRound === 2 && view.currentQuestion.id !== id,
        ),
      ).toBe(true);
      const secondId = secondQuestionViews[0].currentQuestion.id;
      let release!: () => void;
      let saved!: () => void;
      const blocked = new Promise<void>((resolve) => {
        saved = resolve;
      });
      const continuePublish = new Promise<void>((resolve) => {
        release = resolve;
      });
      const submit = services[0].submitAnswer.bind(services[0]);
      jest
        .spyOn(services[0], 'submitAnswer')
        .mockImplementation(async (...args) => {
          const result = await submit(...args);
          if (args[0] === 'guest-right' && args[2] === secondId) {
            saved();
            await continuePublish;
          }
          return result;
        });
      right.emit('ladder:answer', {
        roomCode,
        questionId: secondId,
        optionId: `${secondId}-a`,
      });
      await blocked;
      const revealed = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      left.emit('ladder:answer', {
        roomCode,
        questionId: secondId,
        optionId: `${secondId}-a`,
      });
      const newest = await Promise.all(revealed);
      expect(
        newest.every(
          (view) => view.roundResult?.correctOptionId === `${secondId}-a`,
        ),
      ).toBe(true);
      const seen: number[] = [];
      hostA.on('ladder:room:state', (view: Snapshot) =>
        seen.push(view.revision),
      );
      release();
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(seen.every((revision) => revision >= newest[0].revision)).toBe(
        true,
      );
    } finally {
      clients.forEach((client) => client.disconnect());
      gateways.forEach((gateway) => gateway.onModuleDestroy());
      await Promise.all(servers.map((server) => server.close()));
      await Promise.all(disconnects);
      await Promise.all(adapters.map((adapter) => adapter.quit()));
      await Promise.all(stores.map((redis) => redis.onModuleDestroy()));
      if (redisProcess.pid && redisProcess.exitCode === null) {
        const exited = new Promise<void>((resolve) =>
          redisProcess.once('exit', () => resolve()),
        );
        redisProcess.kill();
        await exited;
      }
      rmdirSync(directory);
    }
  }, 30_000);
});
