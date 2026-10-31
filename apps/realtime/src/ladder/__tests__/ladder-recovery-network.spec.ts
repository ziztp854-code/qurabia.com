import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RedisService } from '../../game/redis.service.js';
import { LadderService } from '../ladder.service.js';
import { LadderGateway } from '../ladder.gateway.js';
import type { LadderRoomRuntime } from '../ladder.types.js';

const network =
  process.env.LADDER_NETWORK_TEST === '1' ? describe : describe.skip;
const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

network('ladder recovery with isolated Redis', () => {
  let child: ChildProcess;
  let redis: RedisService;
  let directory: string;
  let redisUrl: string;
  const gateways: LadderGateway[] = [];
  beforeEach(async () => {
    const portServer = createServer();
    await new Promise<void>((resolve) =>
      portServer.listen(0, '127.0.0.1', resolve),
    );
    const address = portServer.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    const port = address.port;
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
    directory = mkdtempSync(join(tmpdir(), 'ladder-recovery-'));
    child = spawn(
      process.env.LADDER_REDIS_BINARY || 'redis-server',
      [
        '--port',
        String(port),
        '--bind',
        '127.0.0.1',
        '--save',
        '',
        '--appendonly',
        'no',
      ],
      { cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('redis timeout')), 5000);
      child.once('error', reject);
      child.stdout!.on('data', (chunk: Buffer) => {
        if (/ready to accept connections/i.test(chunk.toString())) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    redisUrl = `redis://127.0.0.1:${port}`;
    redis = new RedisService({
      get: (key: string) => (key === 'REDIS_URL' ? redisUrl : ''),
    } as never);
    redis.onModuleInit();
  });
  afterEach(async () => {
    gateways.forEach((gateway) => gateway.onModuleDestroy());
    await redis.onModuleDestroy();
    if (child?.pid && child.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        child.once('exit', () => resolve()),
      );
      child.kill();
      await exited;
    }
    rmdirSync(directory);
  });

  it('resumes an expired final question after gateway restart without any client reconnect, even with two instances', async () => {
    const service = new LadderService(redis, {} as never);
    const now = Date.now();
    const room: LadderRoomRuntime = {
      roomCode: 'ABCDEF12',
      hostId: 'host',
      status: 'active',
      currentRound: 10,
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      currentQuestion: {
        id: 'q',
        roomId: 'ABCDEF12',
        questionText: 'سؤال',
        options: [
          { id: 'a', text: 'أ' },
          { id: 'b', text: 'ب' },
        ],
        category: { id: 'c', name: 'عام' },
        difficulty: 'EASY',
        timeLimit: 20,
        roundNumber: 10,
        createdAt: now - 20000,
      },
      teams: [],
      createdAt: now,
      updatedAt: now,
      currentQuestionId: 'q',
      currentCorrectOptionId: 'a',
      questionOpenedAt: now - 20000,
      questionDeadlineAt: now - 1,
    };
    await redis.saveLadderRoom(room.roomCode, room);
    const createGateway = () => {
      const gateway = new LadderGateway(service, redis, {} as never);
      gateway.server = { to: () => ({ emit: () => undefined }) } as never;
      gateways.push(gateway);
      gateway.afterInit();
      return gateway;
    };
    const original = createGateway();
    original.onModuleDestroy();
    createGateway();
    createGateway();
    let result: LadderRoomRuntime | null = null;
    for (let i = 0; i < 70; i++) {
      await pause(100);
      result = await service.getRoom(room.roomCode);
      if (result?.status === 'finished') break;
    }
    expect(result?.status).toBe('finished');
    expect(result?.roundHistory).toHaveLength(1);
    expect(result?.winnerMethod).toBe('lottery');
    const winner = result?.winner;
    await pause(500);
    expect((await service.getRoom(room.roomCode))?.winner).toBe(winner);
  }, 15_000);

  it.each(['question', 'reveal'] as const)(
    'recovers a %s timer after a transient Redis read failure with no connected clients',
    async (phase) => {
      const service = new LadderService(redis, {} as never);
      const now = Date.now();
      const question = {
        id: 'q-failure',
        roomId: 'RETRY123',
        questionText: 'سؤال',
        options: [
          { id: 'a', text: 'أ' },
          { id: 'b', text: 'ب' },
        ],
        category: { id: 'c', name: 'عام' },
        difficulty: 'EASY' as const,
        timeLimit: 20,
        roundNumber: 10,
        createdAt: now - 20000,
      };
      const answer = {
        optionId: null,
        correct: false,
        elapsedMs: null,
        points: 0,
      };
      const roundResult = {
        roundNumber: 10,
        questionId: question.id,
        questionText: question.questionText,
        options: question.options,
        correctOptionId: 'a',
        right: answer,
        left: answer,
      };
      const room: LadderRoomRuntime = {
        roomCode: 'RETRY123',
        hostId: 'host',
        status: 'active',
        currentRound: 10,
        totalRounds: 10,
        rightScore: 0,
        leftScore: 0,
        rightPosition: 0,
        leftPosition: 0,
        winningPosition: 10,
        currentQuestion: question,
        teams: [],
        createdAt: now,
        updatedAt: now,
        currentQuestionId: question.id,
        currentCorrectOptionId: 'a',
        questionOpenedAt: now - 20000,
        questionDeadlineAt: phase === 'question' ? now - 1 : null,
        roundResult: phase === 'reveal' ? roundResult : null,
        roundHistory: phase === 'reveal' ? [roundResult] : [],
        revealUntil: phase === 'reveal' ? now - 1 : null,
      };
      await redis.saveLadderRoom(room.roomCode, room);
      const originalLoad = redis.loadLadderRoom.bind(redis);
      let calls = 0;
      const load = jest
        .spyOn(redis, 'loadLadderRoom')
        .mockImplementation((code: string) => {
          calls += 1;
          return calls === 2
            ? Promise.reject(new Error('transient Redis failure'))
            : originalLoad(code);
        });
      const gateway = new LadderGateway(service, redis, {} as never);
      gateway.server = { to: () => ({ emit: () => undefined }) } as never;
      gateways.push(gateway);
      gateway.afterInit();
      let result: LadderRoomRuntime | null = null;
      for (let i = 0; i < 100; i++) {
        await pause(100);
        result = await originalLoad(room.roomCode);
        if (result?.status === 'finished') break;
      }
      expect(calls).toBeGreaterThanOrEqual(3);
      expect(result?.status).toBe('finished');
      expect(result?.roundHistory).toHaveLength(1);
      load.mockRestore();
    },
    15_000,
  );

  it('restores timers in a new operating-system process after the previous process terminates', async () => {
    const now = Date.now();
    const room: LadderRoomRuntime = {
      roomCode: 'PROCESS1',
      hostId: 'host',
      status: 'active',
      currentRound: 10,
      totalRounds: 10,
      rightScore: 0,
      leftScore: 0,
      rightPosition: 0,
      leftPosition: 0,
      winningPosition: 10,
      currentQuestion: {
        id: 'q-process',
        roomId: 'PROCESS1',
        questionText: 'سؤال',
        options: [
          { id: 'a', text: 'أ' },
          { id: 'b', text: 'ب' },
        ],
        category: { id: 'c', name: 'عام' },
        difficulty: 'EASY',
        timeLimit: 20,
        roundNumber: 10,
        createdAt: now - 18500,
      },
      teams: [],
      createdAt: now,
      updatedAt: now,
      currentQuestionId: 'q-process',
      currentCorrectOptionId: 'a',
      questionOpenedAt: now - 18500,
      questionDeadlineAt: now + 1500,
    };
    await redis.saveLadderRoom(room.roomCode, room);
    const workerPath = join(
      process.cwd(),
      'src/ladder/__tests__/ladder-recovery-worker.cjs',
    );
    const startWorker = async () => {
      const worker = spawn(process.execPath, [workerPath], {
        cwd: process.cwd(),
        windowsHide: true,
        env: { ...process.env, LADDER_TEST_REDIS_URL: redisUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      await new Promise<void>((resolve, reject) => {
        let errorOutput = '';
        const timer = setTimeout(
          () => reject(new Error(`worker timeout: ${errorOutput}`)),
          5000,
        );
        worker.stderr.on('data', (chunk: Buffer) => {
          errorOutput += chunk.toString();
        });
        worker.once('error', reject);
        worker.once('exit', (code) => {
          if (code !== null)
            reject(new Error(`worker exited ${code}: ${errorOutput}`));
        });
        worker.stdout.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('GATEWAY_READY')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      return worker;
    };
    let worker: ChildProcess | undefined;
    try {
      worker = await startWorker();
      await pause(200);
      const firstExit = new Promise<void>((resolve) =>
        worker!.once('exit', () => resolve()),
      );
      worker.kill();
      await firstExit;
      worker = await startWorker();
      let result: LadderRoomRuntime | null = null;
      for (let i = 0; i < 80; i++) {
        await pause(100);
        result = await redis.loadLadderRoom(room.roomCode);
        if (result?.status === 'finished') break;
      }
      expect(result?.status).toBe('finished');
      expect(result?.roundHistory).toHaveLength(1);
      expect(result?.winnerMethod).toBe('lottery');
    } finally {
      if (worker?.pid && worker.exitCode === null) {
        const exited = new Promise<void>((resolve) =>
          worker!.once('exit', () => resolve()),
        );
        worker.kill();
        await exited;
      }
    }
  }, 20_000);

  it('renews a long-running lock and prevents a competing writer', async () => {
    const service = new LadderService(redis, {} as never);
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const first = service.executeWithRoomLock('LONGLOCK', async () => {
      started();
      await pause(14_000);
      return 'first';
    });
    await entered;
    await pause(10_300);
    const second = await service.executeWithRoomLock('LONGLOCK', () =>
      Promise.resolve('second'),
    );
    expect(second.acquired).toBe(false);
    expect(await first).toEqual({ acquired: true, value: 'first' });
  }, 20_000);

  it('atomically binds one guest to only one room and permits reuse after leaving', async () => {
    const service = new LadderService(redis, {} as never);
    const settings = {
      totalRounds: 10,
      winningPosition: 10,
      questionTimeLimit: 30,
    };
    const first = await service.createRoom(settings, 'host-one');
    const second = await service.createRoom(settings, 'host-two');
    if (!first.ok || !second.ok) throw new Error('room creation failed');
    const [a, b] = await Promise.all([
      service.joinRoom(
        { roomCode: first.room.roomCode, team: 'right', playerName: 'خالد' },
        'same-guest',
        'same-token',
      ),
      service.joinRoom(
        { roomCode: second.room.roomCode, team: 'right', playerName: 'خالد' },
        'same-guest',
        'same-token',
      ),
    ]);
    expect([a, b].filter((result) => result.ok)).toHaveLength(1);
    expect([a, b].find((result) => !result.ok)).toMatchObject({
      code: 'GUEST_IN_ANOTHER_ROOM',
    });
    const joinedCode = a.ok ? first.room.roomCode : second.room.roomCode;
    const otherCode = a.ok ? second.room.roomCode : first.room.roomCode;
    expect((await service.handleReconnect('same-guest', joinedCode)).ok).toBe(
      true,
    );
    expect((await service.leaveRoom('same-guest', joinedCode)).ok).toBe(true);
    expect(
      (
        await service.joinRoom(
          { roomCode: otherCode, team: 'right', playerName: 'خالد' },
          'same-guest',
          'same-token',
        )
      ).ok,
    ).toBe(true);
  });

  it('keeps revisions increasing if a deleted room code is reused', async () => {
    const code = 'REUSED12';
    const original = { roomCode: code, revision: 0, status: 'waiting' };
    await redis.saveLadderRoom(code, original);
    const oldRevision = await redis.saveLadderRoom(code, original);
    await redis.deleteLadderRoom(code);
    const newRevision = await redis.saveLadderRoom(code, original);
    expect(newRevision).toBeGreaterThan(oldRevision);
    const saved = await redis.loadLadderRoom<{ revision: number }>(code);
    expect(saved?.revision).toBe(newRevision);
    const gateway = new LadderGateway({} as never, redis, {} as never);
    const accept = (
      gateway as unknown as { acceptRoomRevision: (room: unknown) => boolean }
    ).acceptRoomRevision.bind(gateway);
    expect(accept({ roomCode: code, revision: oldRevision })).toBe(true);
    expect(accept({ roomCode: code, revision: newRevision })).toBe(true);
    expect(accept({ roomCode: code, revision: oldRevision })).toBe(false);
  });

  it('rejects stale room and guest writes after loss of the lock', async () => {
    const token = 'stale-token';
    const roomCode = 'STALE123';
    expect(await redis.acquireLadderRoomLock(roomCode, token)).toBe(true);
    await redis.releaseLadderRoomLock(roomCode, token);
    expect(await redis.acquireLadderRoomLock(roomCode, 'new-token')).toBe(true);
    await expect(
      redis.saveLadderRoom(roomCode, { marker: 'stale' }, token, {
        guestId: 'stale-guest',
        identity: { marker: 'stale' },
      }),
    ).rejects.toThrow('LADDER_LOCK_LOST');
    expect(await redis.loadLadderRoom(roomCode)).toBeNull();
    expect(await redis.getLadderGuestIdentity('stale-guest')).toBeNull();
    await expect(redis.deleteLadderRoom(roomCode, token)).rejects.toThrow(
      'LADDER_LOCK_LOST',
    );
    await redis.releaseLadderRoomLock(roomCode, 'new-token');
  }, 15_000);
});
