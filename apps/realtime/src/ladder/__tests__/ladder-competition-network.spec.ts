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
import * as privateBank from '../ladder-private-bank.js';
import { COMPETITION_FIXTURE } from './competition-fixture.js';
import { LadderStore } from '../ladder.store.js';
import { RedisService } from '../../infrastructure/redis.service.js';

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

network('competition over real network and Redis', () => {
  let redisProcess: ChildProcess;
  let redis: LadderStore;
  let connection: RedisService;
  let server: HttpServer;
  let sockets: Server;
  let redisDirectory: string;
  const clients: Socket[] = [];
  const disconnects: Promise<void>[] = [];

  afterEach(async () => {
    jest.restoreAllMocks();
    clients.forEach((client) => client.disconnect());
    if (sockets) await sockets.close();
    await Promise.all(disconnects);
    if (server?.listening)
      await new Promise<void>((resolve) => server.close(() => resolve()));
    if (redis) await connection.onModuleDestroy();
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
    connection = new RedisService(config as never);
    connection.onModuleInit();
    redis = new LadderStore(connection);
    const reservations = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        redis.reserveLadderCompetitionPack(
          'allocator-host',
          'EVENT123',
          `reservation-${index}`,
        ),
      ),
    );
    expect(new Set(reservations).size).toBe(8);
    expect(reservations.slice().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(
      await redis.reserveLadderCompetitionPack(
        'allocator-host',
        'EVENT123',
        'reservation-0',
      ),
    ).toBe(reservations[0]);
    expect(
      await redis.reserveLadderCompetitionPack(
        'allocator-host',
        'EVENT123',
        'reservation-9',
      ),
    ).toBeNull();
    expect(
      await redis.reserveLadderCompetitionPack(
        'allocator-host',
        'ANOTHER_EVENT',
        'reservation-0',
      ),
    ).toBe(0);
    jest
      .spyOn(privateBank, 'readPrivateCompetitionBank')
      .mockReturnValue(COMPETITION_FIXTURE);
    const questions = COMPETITION_FIXTURE.sets.flat();
    const database = {
      client: {
        question: {
          findMany: ({ where }: { where: { id?: { notIn: string[] } } }) =>
            Promise.resolve(
              questions.filter((q) => !where.id?.notIn?.includes(q.id)),
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
    host.emit('ladder:host', {
      totalRounds: 10,
      winningPosition: 10,
      competitionMode: true,
      competitionId: 'TEST2026',
    });
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
      currentQuestion: {
        id: string;
        difficulty: string;
        options: Array<{ id: string }>;
      } | null;
      currentRound: number;
      phase: string;
      roundResult: { correctOptionId: string } | null;
      roundHistory: unknown[];
    };
    const started = clients.map((client) =>
      waitEvent<Snapshot>(client, 'ladder:room:state'),
    );
    host.emit('ladder:start', { roomCode });
    let views = await Promise.all(started);
    const ids: string[] = [];
    const levels: string[] = [];
    for (let round = 1; round <= 10; round++) {
      const question = views[0].currentQuestion!;
      expect(
        views.every(
          (v) =>
            v.currentQuestion?.id === question.id && v.currentRound === round,
        ),
      ).toBe(true);
      expect(JSON.stringify(views)).not.toContain('isCorrect');
      ids.push(question.id);
      levels.push(question.difficulty);
      const reviewed = questions.find((q) => q.id === question.id)!;
      const correct = reviewed.options.find((option) => option.isCorrect)!.id;
      const waiting = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      right.emit('ladder:answer', {
        roomCode,
        questionId: question.id,
        optionId: correct,
      });
      await Promise.all(waiting);
      const reveal = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      left.emit('ladder:answer', {
        roomCode,
        questionId: question.id,
        optionId: correct,
      });
      const results = await Promise.all(reveal);
      expect(
        results.every((v) => v.roundResult?.correctOptionId === correct),
      ).toBe(true);
      const next = clients.map((client) =>
        waitEvent<Snapshot>(client, 'ladder:room:state'),
      );
      views = await Promise.all(next);
    }
    expect(new Set(ids).size).toBe(10);
    expect(levels).toEqual([
      'EASY',
      'EASY',
      'EASY',
      'MEDIUM',
      'MEDIUM',
      'MEDIUM',
      'HARD',
      'HARD',
      'HARD',
      'HARD',
    ]);
    expect(
      views.every(
        (v) => v.phase === 'finished' && v.roundHistory.length === 10,
      ),
    ).toBe(true);
  }, 90_000);
});
