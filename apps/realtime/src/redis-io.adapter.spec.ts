import {
  closeSocketIoServers,
  RedisIoAdapter,
  shouldUseRedisStreamsAdapter,
} from './redis-io.adapter.js';

describe('RedisIoAdapter shutdown', () => {
  it('closes Socket.IO servers before closing the Redis client', async () => {
    const events: string[] = [];
    const server = {
      close: jest.fn((callback: () => void) => {
        events.push('server.close');
        callback();
      }),
    };
    const adapter = new RedisIoAdapter({} as never, 'redis://configured');
    const redisClient = {
      status: 'ready',
      quit: jest.fn().mockImplementation(() => {
        events.push('redis.quit');
        return Promise.resolve();
      }),
      disconnect: jest.fn(),
      on: jest.fn(),
    };
    (
      adapter as unknown as {
        servers: Set<typeof server>;
        redisClient: typeof redisClient;
      }
    ).servers = new Set([server]);
    (adapter as unknown as { redisClient: typeof redisClient }).redisClient =
      redisClient;

    await adapter.disconnect();

    expect(events).toEqual(['server.close', 'redis.quit']);
  });

  it('treats already-closed Socket.IO servers as shutdown-safe', async () => {
    const server = {
      close: jest.fn(() => {
        throw new Error('server already closed');
      }),
    };

    await expect(
      closeSocketIoServers([server as never]),
    ).resolves.toBeUndefined();
  });

  it('swallows async Socket.IO close rejections during serverless shutdown', async () => {
    const server = {
      close: jest.fn(() => Promise.reject(new Error('adapter already closed'))),
    };

    await expect(
      closeSocketIoServers([server as never]),
    ).resolves.toBeUndefined();
  });

  it('enables the Redis streams adapter wherever Redis is configured', () => {
    expect(
      shouldUseRedisStreamsAdapter({
        VERCEL: '1',
        REDIS_URL: 'redis://configured',
      }),
    ).toBe(true);
    expect(
      shouldUseRedisStreamsAdapter({ REDIS_URL: 'redis://configured' }),
    ).toBe(true);
    expect(shouldUseRedisStreamsAdapter({ VERCEL: '1' })).toBe(false);
    expect(shouldUseRedisStreamsAdapter({})).toBe(false);
  });

  it('honours an explicit opt-out even when Redis is configured', () => {
    expect(
      shouldUseRedisStreamsAdapter({
        REDIS_URL: 'redis://configured',
        SOCKET_IO_REDIS_STREAMS_ADAPTER: 'false',
      }),
    ).toBe(false);
    expect(
      shouldUseRedisStreamsAdapter({
        VERCEL: '1',
        SOCKET_IO_REDIS_STREAMS_ADAPTER: 'true',
      }),
    ).toBe(true);
  });
});
