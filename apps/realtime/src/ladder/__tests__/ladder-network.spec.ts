import { createServer, type Server as HttpServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLadderHostAccessToken } from '@tahaddi/contracts';
import { Server } from 'socket.io';
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

network('ladder real network and Redis', () => {
  let redisProcess: ChildProcess;
  let redis: RedisService;
  let server: HttpServer;
  let sockets: Server;
  let redisDirectory: string;
  const clients: Socket[] = [];
  const disconnects: Promise<void>[] = [];

  afterEach(async () => {
    clients.forEach((client) => client.disconnect());
    if (sockets) await sockets.close();
    await Promise.all(disconnects);
    if (server?.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (redis) await redis.onModuleDestroy();
    if (redisProcess?.pid && redisProcess.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        redisProcess.once('exit', () => resolve()),
      );
      redisProcess.kill();
      await exited;
    }
    if (redisDirectory) rmdirSync(redisDirectory);
  });

  it('synchronizes host and two teams, scores once and restores a disconnected player', async () => {
    const portServer = createServer();
    await new Promise<void>((resolve) =>
      portServer.listen(0, '127.0.0.1', resolve),
    );
    const portAddress = portServer.address();
    if (!portAddress || typeof portAddress === 'string')
      throw new Error('No port');
    const redisPort = portAddress.port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
    redisDirectory = mkdtempSync(join(tmpdir(), 'qurabia-ladder-test-'));
    redisProcess = spawn(
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
      {
        windowsHide: true,
        cwd: redisDirectory,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    await waitForRedisReady(redisProcess);
    if (redisProcess.exitCode !== null)
      throw new Error('Redis exited after readiness');
    const config = {
      get: (key: string) =>
        key === 'REDIS_URL' ? `redis://127.0.0.1:${redisPort}` : secret,
    };
    redis = new RedisService(config as never);
    redis.onModuleInit();
    const questions = Array.from({ length: 22 }, (_, i) => ({
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
    const service = new LadderService(redis, database as never);
    const gateway = new LadderGateway(service, redis, config as never);
    server = createServer();
    sockets = new Server(server);
    const namespace = sockets.of('/ladder');
    gateway.server = namespace as never;
    namespace.on('connection', (socket) => {
      socket.on(
        'ladder:host',
        (value: unknown) =>
          void gateway.hostRoom(socket as never, value as never),
      );
      socket.on(
        'ladder:join',
        (value: unknown) =>
          void gateway.joinRoom(socket as never, value as never),
      );
      socket.on(
        'ladder:start',
        (value: unknown) =>
          void gateway.startGame(socket as never, value as never),
      );
      socket.on(
        'ladder:answer',
        (value: unknown) =>
          void gateway.submitAnswer(socket as never, value as never),
      );
      socket.on(
        'ladder:reconnect',
        (value: unknown) =>
          void gateway.reconnect(socket as never, value as never),
      );
      socket.on('disconnect', () => {
        disconnects.push(gateway.handleDisconnect(socket as never));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('No server address');
    const url = `http://127.0.0.1:${addr.port}/ladder`;
    const host = io(url, {
      transports: ['websocket'],
      auth: {
        hostId: 'host-test',
        hostAccessToken: createLadderHostAccessToken(secret, {
          hostId: 'host-test',
          expiresAt: Date.now() + 60_000,
        }),
      },
    });
    const right = io(url, {
      transports: ['websocket'],
      auth: {
        guestId: 'guest-right',
        guestToken: randomBytes(32).toString('hex'),
      },
    });
    const left = io(url, {
      transports: ['websocket'],
      auth: {
        guestId: 'guest-left',
        guestToken: randomBytes(32).toString('hex'),
      },
    });
    clients.push(host, right, left);
    await Promise.all(clients.map((client) => waitEvent(client, 'connect')));
    const hosted = waitEvent<{ roomCode: string }>(host, 'ladder:room:state');
    host.emit('ladder:host', { totalRounds: 20, winningPosition: 10 });
    const { roomCode } = await hosted;
    const joinedRight = waitEvent(right, 'ladder:room:state');
    right.emit('ladder:join', {
      roomCode,
      playerName: 'لاعب اليمين',
      team: 'right',
    });
    await joinedRight;
    const joinedLeft = waitEvent(left, 'ladder:room:state');
    left.emit('ladder:join', {
      roomCode,
      playerName: 'لاعب اليسار',
      team: 'left',
    });
    await joinedLeft;
    type Snapshot = {
      currentQuestion: { id: string; timeLimit: number };
      currentRound: number;
      rightPosition: number;
      leftPosition: number;
      answerStatus: { right: boolean; left: boolean };
      roundResult: { correctOptionId: string } | null;
    };
    const started = clients.map((client) =>
      waitEvent<Snapshot>(client, 'ladder:room:state'),
    );
    host.emit('ladder:start', { roomCode });
    const views = await Promise.all(started);
    expect(new Set(views.map((view) => view.currentQuestion.id)).size).toBe(1);
    const id = views[0].currentQuestion.id;
    const first = clients.map((client) =>
      waitEvent<Snapshot>(client, 'ladder:room:state'),
    );
    right.emit('ladder:answer', {
      roomCode,
      questionId: id,
      optionId: `${id}-a`,
    });
    const waiting = await Promise.all(first);
    expect(
      waiting.every(
        (view) =>
          view.currentRound === 1 &&
          view.rightPosition === 0 &&
          view.answerStatus.right &&
          !view.roundResult,
      ),
    ).toBe(true);
    const duplicate = waitEvent<{ code: string }>(right, 'ladder:error');
    right.emit('ladder:answer', {
      roomCode,
      questionId: id,
      optionId: `${id}-a`,
    });
    expect((await duplicate).code).toBe('ALREADY_ANSWERED');
    left.disconnect();
    left.connect();
    await waitEvent(left, 'connect');
    const restored = clients.map((client) =>
      waitEvent<Snapshot>(client, 'ladder:room:state'),
    );
    left.emit('ladder:reconnect', { roomCode });
    expect(
      (await Promise.all(restored)).every((view) => view.answerStatus.right),
    ).toBe(true);
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
        (view) =>
          view.rightPosition === 1 &&
          view.leftPosition === 1 &&
          view.roundResult?.correctOptionId === `${id}-a`,
      ),
    ).toBe(true);
    const next = clients.map((client) =>
      waitEvent<Snapshot>(client, 'ladder:room:state'),
    );
    const nextViews = await Promise.all(next);
    expect(
      nextViews.every(
        (view) =>
          view.currentRound === 2 &&
          view.currentQuestion.id !== id &&
          !view.roundResult,
      ),
    ).toBe(true);
  }, 30_000);
});
