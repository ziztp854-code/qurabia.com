import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { GameStartPushService } from './game-start-push.service.js';
import type {
  GameStartPushJob,
  GameStartPushReceiptJob,
} from './redis.service.js';

type FetchMock = jest.MockedFunction<typeof fetch>;

const receiptPushFixture = ['ExponentPushToken[', 'token-1', ']'].join('');
const privatePushFixture = ['ExponentPushToken[', 'private-token', ']'].join(
  '',
);

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function requestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== 'string') throw new Error('Expected a JSON body');
  return JSON.parse(init.body) as unknown;
}

function durableRedis() {
  const jobs = new Map<string, GameStartPushJob>();
  const completed = new Set<string>();
  const redis = {
    jobs,
    completed,
    enqueueGameStartPushDispatch: jest.fn(
      (sessionId: string, roomCode: string, startedAt: number = Date.now()) => {
        const id = `dispatch:${sessionId}`;
        if (jobs.has(id) || completed.has(id)) return Promise.resolve(false);
        jobs.set(id, {
          id,
          kind: 'dispatch',
          sessionId,
          roomCode,
          attempt: 0,
          createdAt: startedAt,
          expiresAt: startedAt + 24 * 60 * 60 * 1_000,
          dueAt: Date.now(),
        });
        return Promise.resolve(true);
      },
    ),
    enqueueGameStartPushReceipts: jest.fn(
      (
        entries: Array<{
          ticketId: string;
          token: string;
          sessionId: string;
          roomCode: string;
          createdAt: number;
          expiresAt: number;
        }>,
        dueAt: number,
      ) => {
        for (const entry of entries) {
          const id = `receipt:${entry.ticketId}`;
          jobs.set(id, {
            id,
            kind: 'receipt',
            ...entry,
            attempt: 0,
            dueAt,
          });
        }
        return Promise.resolve(entries.length);
      },
    ),
    claimDueGameStartPushJobs: jest.fn(
      (now: number, limit: number, leaseUntil: number) => {
        const due = [...jobs.values()]
          .filter((job) => job.dueAt <= now)
          .slice(0, limit);
        due.forEach((job) => jobs.set(job.id, { ...job, dueAt: leaseUntil }));
        return Promise.resolve(due);
      },
    ),
    requeueGameStartPushJob: jest.fn((job: GameStartPushJob, dueAt: number) => {
      jobs.set(job.id, { ...job, dueAt });
      return Promise.resolve(true);
    }),
    renewGameStartPushJobLease: jest.fn(
      (id: string, expectedLeaseUntil: number, leaseUntil: number) => {
        const job = jobs.get(id);
        if (!job || job.dueAt !== expectedLeaseUntil)
          return Promise.resolve(false);
        jobs.set(id, { ...job, dueAt: leaseUntil });
        return Promise.resolve(true);
      },
    ),
    completeGameStartPushJob: jest.fn((id: string, retainDedupe: boolean) => {
      jobs.delete(id);
      if (retainDedupe) completed.add(id);
      return Promise.resolve();
    }),
  };
  return redis;
}

describe('GameStartPushService durable delivery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-20T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  function setup(options?: {
    redis?: ReturnType<typeof durableRedis>;
    tokens?: string[];
    expoAccessToken?: string;
    recentSessions?: Array<{
      id: string;
      roomCode: string;
      startedAt: Date;
    }>;
  }) {
    const tokens = options?.tokens ?? [receiptPushFixture];
    type DeviceUpdate = {
      where: { enabled: boolean; expoPushToken: { in: string[] } };
      data: { enabled: boolean; lastSeenAt: Date };
    };
    const updateMany = jest.fn((input: DeviceUpdate) => {
      void input;
      return Promise.resolve({ count: 1 });
    });
    const database = {
      client: {
        liveSession: {
          findMany: jest.fn().mockResolvedValue(options?.recentSessions ?? []),
        },
        mobilePushDevice: {
          findMany: jest
            .fn()
            .mockResolvedValue(
              tokens.map((expoPushToken) => ({ expoPushToken })),
            ),
          updateMany,
        },
      },
    };
    const redis = options?.redis ?? durableRedis();
    const config = {
      get: jest.fn().mockReturnValue(options?.expoAccessToken),
    } as unknown as ConfigService;
    const service = new GameStartPushService(
      database as never,
      redis as never,
      config,
    );
    return { database, redis, service, tokens };
  }

  it('sends a short-lived collapsed payload with auth only to scoped participants', async () => {
    const { database, service } = setup({ expoAccessToken: 'expo-secret' });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      ) as FetchMock;

    await service.notifyGameStarted({
      sessionId: 'private-session-id',
      roomCode: 'ABC123',
    });

    expect(database.client.mobilePushDevice.findMany).toHaveBeenCalledWith({
      where: {
        enabled: true,
        user: {
          is: {
            status: 'ACTIVE',
            liveParticipations: { some: { sessionId: 'private-session-id' } },
          },
        },
      },
      select: { expoPushToken: true },
      orderBy: { id: 'asc' },
    });
    const message = (
      requestBody(fetchMock.mock.calls[0]?.[1]) as unknown[]
    )[0] as {
      ttl: number;
      collapseId: string;
      threadId: string;
    };
    expect(message.ttl).toBe(900);
    expect(message.collapseId).toMatch(/^game-start-[a-f0-9]{32}$/);
    expect(message.threadId).toBe(message.collapseId);
    expect(JSON.stringify(message)).not.toContain('private-session-id');
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer expo-secret',
    });
  });

  it('reconciles the crash window after a game became active and sends it only once', async () => {
    const startedAt = new Date(Date.now() - 1_000);
    const { database, redis, service } = setup({
      recentSessions: [{ id: 'session-1', roomCode: 'ABC123', startedAt }],
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      ) as FetchMock;

    await service.reconcileAndProcessDueJobs();
    await service.reconcileAndProcessDueJobs();

    expect(database.client.liveSession.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        startedAt: {
          gte: new Date(Date.now() - 15 * 60 * 1_000),
          lte: new Date(Date.now() + 5_000),
        },
      },
      select: { id: true, roomCode: true, startedAt: true },
      orderBy: { startedAt: 'asc' },
    });
    expect(redis.enqueueGameStartPushDispatch).toHaveBeenCalledWith(
      'session-1',
      'ABC123',
      startedAt.getTime(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a direct enqueue racing startup reconciliation', async () => {
    const startedAt = new Date();
    const sharedRedis = durableRedis();
    const { service } = setup({
      redis: sharedRedis,
      recentSessions: [{ id: 'session-1', roomCode: 'ABC123', startedAt }],
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      ) as FetchMock;

    await Promise.all([
      service.notifyGameStarted({
        sessionId: 'session-1',
        roomCode: 'ABC123',
      }),
      service.reconcileAndProcessDueJobs(),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('claims one durable job per sweep and renews its lease before I/O', async () => {
    const sharedRedis = durableRedis();
    const firstStartedAt = Date.now();
    await sharedRedis.enqueueGameStartPushDispatch(
      'session-1',
      'ABC123',
      firstStartedAt,
    );
    await sharedRedis.enqueueGameStartPushDispatch(
      'session-2',
      'DEF456',
      firstStartedAt,
    );
    const { redis, service } = setup({ redis: sharedRedis });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      );

    await service.processDueJobs();

    expect(redis.claimDueGameStartPushJobs).toHaveBeenCalledWith(
      Date.now(),
      1,
      Date.now() + 10 * 60 * 1_000,
    );
    expect(redis.renewGameStartPushJobLease).toHaveBeenCalledWith(
      'dispatch:session-1',
      Date.now() + 10 * 60 * 1_000,
      Date.now() + 10 * 60 * 1_000,
    );
    expect(sharedRedis.jobs.has('dispatch:session-2')).toBe(true);
  });

  it('does not send after losing the durable lease', async () => {
    const sharedRedis = durableRedis();
    await sharedRedis.enqueueGameStartPushDispatch(
      'session-1',
      'ABC123',
      Date.now(),
    );
    sharedRedis.renewGameStartPushJobLease.mockResolvedValueOnce(false);
    const { redis, service } = setup({ redis: sharedRedis });
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await service.processDueJobs();

    expect(redis.renewGameStartPushJobLease).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redis.completeGameStartPushJob).not.toHaveBeenCalled();
    expect(redis.requeueGameStartPushJob).not.toHaveBeenCalled();
  });

  it('recovers a due receipt after service restart and disables the device', async () => {
    const sharedRedis = durableRedis();
    const first = setup({ redis: sharedRedis });
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      );
    await first.service.notifyGameStarted({
      sessionId: 'session-1',
      roomCode: 'ABC123',
    });
    first.service.onModuleDestroy();

    jest.setSystemTime(new Date(Date.now() + 15 * 60 * 1_000));
    const restarted = setup({ redis: sharedRedis });
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({
        data: {
          'ticket-1': {
            status: 'error',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      }),
    );

    await restarted.service.processDueJobs();

    expect(
      restarted.database.client.mobilePushDevice.updateMany,
    ).toHaveBeenCalled();
    expect(sharedRedis.jobs.has('receipt:ticket-1')).toBe(false);
  });

  it('requeues a receipt when disabling the device fails', async () => {
    const sharedRedis = durableRedis();
    const now = Date.now();
    const receipt: GameStartPushReceiptJob = {
      id: 'receipt:ticket-1',
      kind: 'receipt',
      ticketId: 'ticket-1',
      token: receiptPushFixture,
      sessionId: 'session-1',
      roomCode: 'ABC123',
      attempt: 0,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1_000,
      dueAt: now,
    };
    sharedRedis.jobs.set(receipt.id, receipt);
    const { database, service } = setup({ redis: sharedRedis });
    database.client.mobilePushDevice.updateMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({
        data: {
          'ticket-1': {
            status: 'error',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      }),
    );

    await service.processDueJobs();

    expect(sharedRedis.requeueGameStartPushJob).toHaveBeenCalled();
    expect(sharedRedis.completeGameStartPushJob).not.toHaveBeenCalledWith(
      receipt.id,
      false,
    );
    expect(sharedRedis.jobs.get(receipt.id)?.attempt).toBe(1);
  });

  it('logs terminal provider errors without leaking a token or payload', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, tokens } = setup();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({
        data: [
          {
            status: 'error',
            details: { error: 'InvalidCredentials' },
          },
        ],
      }),
    );

    await service.notifyGameStarted({
      sessionId: 'session-1',
      roomCode: 'ABC123',
    });

    expect(warn).toHaveBeenCalledWith({
      event: 'game_start_push_provider_error',
      source: 'ticket',
      errorCode: 'InvalidCredentials',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(tokens[0]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ABC123');
  });

  it('logs and completes a terminal receipt error without exposing its mapping', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const sharedRedis = durableRedis();
    const now = Date.now();
    sharedRedis.jobs.set('receipt:ticket-1', {
      id: 'receipt:ticket-1',
      kind: 'receipt',
      ticketId: 'ticket-1',
      token: privatePushFixture,
      sessionId: 'session-1',
      roomCode: 'ABC123',
      attempt: 0,
      createdAt: now,
      expiresAt: now + 24 * 60 * 60 * 1_000,
      dueAt: now,
    });
    const { service } = setup({ redis: sharedRedis });
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({
        data: {
          'ticket-1': {
            status: 'error',
            details: { error: 'MismatchSenderId' },
          },
        },
      }),
    );

    await service.processDueJobs();

    expect(warn).toHaveBeenCalledWith({
      event: 'game_start_push_provider_error',
      source: 'receipt',
      errorCode: 'MismatchSenderId',
    });
    expect(sharedRedis.jobs.has('receipt:ticket-1')).toBe(false);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-token');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('ticket-1');
  });

  it('requeues MessageRateExceeded but completes no terminal dispatch', async () => {
    const { redis, service } = setup();
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({
        data: [
          {
            status: 'error',
            details: { error: 'MessageRateExceeded' },
          },
        ],
      }),
    );

    await service.notifyGameStarted({
      sessionId: 'session-1',
      roomCode: 'ABC123',
    });

    expect(redis.requeueGameStartPushJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'dispatch',
        tokens: [receiptPushFixture],
        attempt: 1,
      }),
      expect.any(Number),
    );
    expect(redis.completeGameStartPushJob).not.toHaveBeenCalled();
  });

  it('turns a rate-limited receipt back into a durable dispatch job', async () => {
    const sharedRedis = durableRedis();
    const now = Date.now();
    sharedRedis.jobs.set('receipt:ticket-1', {
      id: 'receipt:ticket-1',
      kind: 'receipt',
      ticketId: 'ticket-1',
      token: receiptPushFixture,
      sessionId: 'session-1',
      roomCode: 'ABC123',
      attempt: 0,
      createdAt: now - 15 * 60 * 1_000,
      expiresAt: now + 23 * 60 * 60 * 1_000,
      dueAt: now,
    });
    const { redis, service } = setup({ redis: sharedRedis });
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      response({
        data: {
          'ticket-1': {
            status: 'error',
            details: { error: 'MessageRateExceeded' },
          },
        },
      }),
    );

    await service.processDueJobs();

    expect(redis.requeueGameStartPushJob).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'receipt:ticket-1',
        kind: 'dispatch',
        tokens: [receiptPushFixture],
        createdAt: now - 15 * 60 * 1_000,
        attempt: 1,
      }),
      expect.any(Number),
    );
  });

  it('preserves original freshness across dispatch, receipt, and rate-limit retry', async () => {
    const sharedRedis = durableRedis();
    const originalCreatedAt = Date.now() - 5 * 60 * 1_000;
    const originalExpiresAt = originalCreatedAt + 24 * 60 * 60 * 1_000;
    await sharedRedis.enqueueGameStartPushDispatch(
      'session-1',
      'ABC123',
      originalCreatedAt,
    );
    const { redis, service } = setup({ redis: sharedRedis });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      ) as FetchMock;

    await service.processDueJobs();

    expect(sharedRedis.jobs.get('receipt:ticket-1')).toMatchObject({
      kind: 'receipt',
      createdAt: originalCreatedAt,
      expiresAt: originalExpiresAt,
    });

    jest.setSystemTime(new Date(Date.now() + 15 * 60 * 1_000));
    fetchMock.mockResolvedValueOnce(
      response({
        data: {
          'ticket-1': {
            status: 'error',
            details: { error: 'MessageRateExceeded' },
          },
        },
      }),
    );
    await service.processDueJobs();

    expect(redis.requeueGameStartPushJob).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'receipt:ticket-1',
        kind: 'dispatch',
        createdAt: originalCreatedAt,
        expiresAt: originalExpiresAt,
      }),
      expect.any(Number),
    );
  });

  it('retries 429 but does not retry another 4xx response', async () => {
    const retried = setup();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({}, false, 429))
      .mockResolvedValueOnce(
        response({ data: [{ status: 'ok', id: 'ticket-1' }] }),
      ) as FetchMock;
    const pending = retried.service.notifyGameStarted({
      sessionId: 'session-1',
      roomCode: 'ABC123',
    });
    await jest.advanceTimersByTimeAsync(500);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(response({}, false, 400));
    const terminal = setup();
    await terminal.service.notifyGameStarted({
      sessionId: 'session-2',
      roomCode: 'DEF456',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(terminal.redis.requeueGameStartPushJob).not.toHaveBeenCalled();
    expect(terminal.redis.completeGameStartPushJob).toHaveBeenCalledWith(
      'dispatch:session-2',
      true,
      expect.any(Number),
    );
  });

  it('durably requeues a dispatch after all network retries fail', async () => {
    const { redis, service } = setup();
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('network unavailable')) as FetchMock;

    const pending = service.notifyGameStarted({
      sessionId: 'session-1',
      roomCode: 'ABC123',
    });
    await jest.advanceTimersByTimeAsync(1_500);
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(redis.requeueGameStartPushJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dispatch', attempt: 1 }),
      expect.any(Number),
    );
    expect(redis.completeGameStartPushJob).not.toHaveBeenCalled();
  });
});
