import {
  closeRedisClient,
  handleRedisCloseRejection,
} from './redis-client-lifecycle.js';

describe('closeRedisClient', () => {
  it('swallows the benign ioredis close rejection during Vercel shutdown', async () => {
    const client = {
      status: 'ready',
      quit: jest.fn().mockRejectedValue(new Error('Connection is closed.')),
      disconnect: jest.fn(),
    };
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      closeRedisClient(client as never, 'Socket.IO Redis'),
    ).resolves.toBeUndefined();

    expect(client.disconnect).toHaveBeenCalledWith(false);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('handles ioredis close rejections emitted outside the shutdown hook', () => {
    const consoleWarn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    expect(
      handleRedisCloseRejection(
        new Error('Connection is closed.'),
        'Socket.IO Redis',
      ),
    ).toBe(true);
    expect(consoleWarn).toHaveBeenCalledWith(
      '[Socket.IO Redis] Ignored Redis close rejection during shutdown.',
    );

    consoleWarn.mockRestore();
  });

  it('does not classify unrelated unhandled rejections as Redis shutdown noise', () => {
    expect(
      handleRedisCloseRejection(new Error('network failed'), 'Redis'),
    ).toBe(false);
  });

  it('disconnects without quit when the client is already closing', async () => {
    const client = {
      status: 'close',
      quit: jest.fn(),
      disconnect: jest.fn(),
    };

    await closeRedisClient(client as never, 'Redis');

    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(false);
  });

  it('disconnects immediately when the client is still reconnecting', async () => {
    const client = {
      status: 'reconnecting',
      quit: jest.fn(),
      disconnect: jest.fn(),
    };

    await closeRedisClient(client as never, 'Redis');

    expect(client.quit).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(false);
  });

  it('logs unexpected shutdown errors without throwing an unhandled rejection', async () => {
    const client = {
      status: 'ready',
      quit: jest.fn().mockRejectedValue(new Error('network failed')),
      disconnect: jest.fn(),
    };
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(
      closeRedisClient(client as never, 'Redis'),
    ).resolves.toBeUndefined();

    expect(client.disconnect).toHaveBeenCalledWith(false);
    expect(consoleError).toHaveBeenCalledWith(
      '[Redis] Redis shutdown error:',
      'network failed',
    );
    consoleError.mockRestore();
  });
});
