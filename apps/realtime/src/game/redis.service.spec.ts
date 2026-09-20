import type { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';

describe('RedisService distributed rate limiter', () => {
  it('increments atomically with a fixed TTL and never stores the raw subject', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    const evalCommand = jest.fn().mockResolvedValue(1);
    (service as unknown as { client: { eval: jest.Mock } }).client = {
      eval: evalCommand,
    };

    await expect(
      service.consumeRateLimit(
        'chess:move:203.0.113.42:raw-untrusted-value',
        120,
        60_000,
      ),
    ).resolves.toBe(true);

    expect(evalCommand).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      expect.stringMatching(/^rate-limit:[a-f0-9]{64}$/),
      60_000,
    );
    expect(JSON.stringify(evalCommand.mock.calls)).not.toContain(
      'raw-untrusted-value',
    );
  });

  it('fails closed when configured Redis rejects the rate-limit command', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    (service as unknown as { client: { eval: jest.Mock } }).client = {
      eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
    };

    await expect(
      service.consumeRateLimit('chess:reconnect:203.0.113.42', 20, 60_000),
    ).resolves.toBe(false);
  });

  it('defers to the local limiter when Redis is not configured', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    await expect(
      service.consumeRateLimit('chess:create:203.0.113.42', 3, 60_000),
    ).resolves.toBeNull();
  });

  it('does not leave an unhandled rejection when Redis closes before module shutdown', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    const client = {
      status: 'ready',
      quit: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
      disconnect: jest.fn(),
    };
    (service as unknown as { client: typeof client }).client = client;

    await expect(service.onModuleDestroy()).resolves.toBeUndefined();

    expect(client.disconnect).toHaveBeenCalledWith(false);
  });

  it('uses an isolated Redis lock namespace for chess rooms', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    const client = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };
    (service as unknown as { client: typeof client }).client = client;

    await expect(
      service.acquireChessRoomLock('123456', 'token_1'),
    ).resolves.toBe(true);
    await service.releaseChessRoomLock('123456', 'token_1');

    expect(client.set).toHaveBeenCalledWith(
      'chess:room:123456:lock',
      'token_1',
      'PX',
      expect.any(Number),
      'NX',
    );
    expect(client.eval.mock.calls[0]).toContain('chess:room:123456:lock');
    expect(JSON.stringify(client.set.mock.calls)).not.toContain(
      'special-game:123456:lock',
    );
  });

  it('enqueues a durable game-start job for at most 24 hours without a raw id in its key', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    const client = { eval: jest.fn().mockResolvedValue(1) };
    (service as unknown as { client: typeof client }).client = client;

    await expect(
      service.enqueueGameStartPushDispatch('private-session-id', 'ABC123'),
    ).resolves.toBe(true);

    const args = client.eval.mock.calls[0] as unknown[];
    expect(args[2]).toMatch(/^live:push:game-start:job:dispatch:[a-f0-9]{64}$/);
    expect(String(args[2])).not.toContain('private-session-id');
    expect(String(args[4])).toContain('"expiresAt"');
    const ttl = args[5] as number;
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it('atomically leases due push jobs so another instance cannot claim them immediately', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    const payload = JSON.stringify({
      id: 'dispatch:hash',
      kind: 'dispatch',
      sessionId: 'session-1',
      roomCode: 'ABC123',
      attempt: 0,
      createdAt: 1,
      expiresAt: 2,
      dueAt: 1,
    });
    const client = { eval: jest.fn().mockResolvedValue([payload]) };
    (service as unknown as { client: typeof client }).client = client;

    await expect(
      service.claimDueGameStartPushJobs(1_000, 100, 61_000),
    ).resolves.toEqual([expect.objectContaining({ id: 'dispatch:hash' })]);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('ZADD'),
      1,
      'live:push:game-start:due',
      1_000,
      100,
      61_000,
      'live:push:game-start:job:',
    );
  });

  it('renews a claimed push job lease only while its durable job still exists', async () => {
    const service = new RedisService({
      get: jest.fn().mockReturnValue('redis://configured'),
    } as unknown as ConfigService);
    const client = { eval: jest.fn().mockResolvedValue(1) };
    (service as unknown as { client: typeof client }).client = client;

    await expect(
      service.renewGameStartPushJobLease('dispatch:hash', 600_000, 1_200_000),
    ).resolves.toBe(true);

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('"XX"'),
      2,
      'live:push:game-start:job:dispatch:hash',
      'live:push:game-start:due',
      600_000,
      1_200_000,
      'dispatch:hash',
    );
  });
});
