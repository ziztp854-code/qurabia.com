import { ConfigService } from '@nestjs/config';
import type { Namespace, Socket } from 'socket.io';
import { KingdomsGateway } from './kingdoms.gateway.js';
import { KingdomsWorker, kingdomWorkerEndpoint } from './kingdoms.worker.js';

describe('Kingdoms persisted event worker', () => {
  const fetchMock = jest.fn();
  const publish = jest.fn();
  const health = jest.fn();
  const heartbeat = jest.fn();
  const watched = jest.fn();
  const config = (values: Record<string, string>) =>
    ({ get: (key: string) => values[key] }) as ConfigService;
  const makeWorker = (
    values: Record<string, string> = {
      KINGDOMS_WEB_ORIGIN: 'http://localhost:3000',
      KINGDOMS_WORKER_SECRET: 'test-worker-secret-at-least-32-characters',
    },
  ) =>
    new KingdomsWorker(config(values), {
      publishRevision: publish,
      setWorkerHealth: health,
      heartbeat,
      watchedWorldIds: watched,
    } as unknown as KingdomsGateway);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    fetchMock.mockReset();
    publish.mockReset();
    health.mockReset();
    heartbeat.mockReset();
    watched.mockReset().mockReturnValue([]);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('only permits exact HTTP origins without credentials, paths or redirects', () => {
    expect(kingdomWorkerEndpoint('https://example.com', true)).toBe(
      'https://example.com/api/internal/kingdoms/tick/',
    );
    for (const invalid of [
      'file:///tmp',
      'https://user:password@example.com',
      'https://example.com/path',
      'https://example.com?x=1',
    ]) {
      expect(kingdomWorkerEndpoint(invalid)).toBeNull();
    }
    expect(kingdomWorkerEndpoint('http://example.com', true)).toBeNull();
  });

  it('does no network work when configuration is absent', async () => {
    const worker = makeWorker({});
    worker.onModuleInit();
    await worker.tick();
    expect(fetchMock).not.toHaveBeenCalled();
    worker.onModuleDestroy();
  });

  it('publishes only a validated committed revision and bounds each batch', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { worlds: [{ id: 'world-1', revision: 3 }] },
        }),
    });
    const worker = makeWorker();
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/internal/kingdoms/tick/',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: '{"limit":10,"watchedWorldIds":[]}',
      }),
    );
    expect(publish).toHaveBeenCalledWith('world-1', 3);
    worker.onModuleDestroy();
  });

  it('prevents overlapping polling and aborts in flight work on shutdown', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const worker = makeWorker();
    const active = worker.tick();
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = (fetchMock.mock.calls as [string, RequestInit][])[0][1];
    worker.onModuleDestroy();
    expect(options.signal?.aborted).toBe(true);
    finish({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { worlds: [{ id: 'world-1', revision: 1 }] },
        }),
    });
    await active;
    expect(publish).not.toHaveBeenCalled();
  });

  it('ignores malformed responses and recovers for the next poll', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { worlds: [{ id: '../bad', revision: -1 }] },
        }),
    });
    const worker = makeWorker();
    await worker.tick();
    expect(publish).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { worlds: [] } }),
    });
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
  });

  it('polls at startup and every five seconds, then stops on shutdown', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { worlds: [] } }),
    });
    const worker = makeWorker();
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts slow upstream requests and allows a subsequent retry', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        }),
    );
    const worker = makeWorker();
    const active = worker.tick();
    await jest.advanceTimersByTimeAsync(10_000);
    await active;
    expect(publish).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { worlds: [] } }),
    });
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
  });

  it('requires new web notification capability before declaring push live', async () => {
    const worker = makeWorker();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { worlds: [] } }),
    });
    await worker.tick();
    expect(health).toHaveBeenLastCalledWith(false);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            realtime: {
              capability: 'revision-push-v1',
              notificationsConfigured: false,
            },
          },
        }),
    });
    await worker.tick();
    expect(health).toHaveBeenLastCalledWith(false);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            realtime: {
              capability: 'revision-push-v1',
              notificationsConfigured: true,
            },
            revisions: [],
          },
        }),
    });
    await worker.tick();
    expect(health).toHaveBeenLastCalledWith(true);
    expect(heartbeat).toHaveBeenCalledTimes(3);
    fetchMock.mockRejectedValueOnce(new Error('temporary outage'));
    await worker.tick();
    expect(health).toHaveBeenLastCalledWith(false);
    expect(heartbeat).toHaveBeenCalledTimes(3);
    worker.onModuleDestroy();
  });

  it('accelerates a new deadline with one central timer and ignores malformed dates', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { worlds: [] } }),
    });
    const worker = makeWorker();
    worker.scheduleDeadline(Date.now() + 3_000);
    worker.scheduleDeadline(Number.NaN);
    worker.scheduleDeadline(-1);
    worker.scheduleDeadline(Date.now() + 1_000);
    worker.scheduleDeadline(Date.now() + 4_000);
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    worker.onModuleDestroy();
  });

  it('schedules automatic return deadlines supplied by the durable tick snapshot', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              worlds: [{ id: 'world-1', revision: 3 }],
              nextEventAt: Date.now() + 800,
            },
          }),
      })
      .mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { worlds: [], nextEventAt: null },
          }),
      });
    const worker = makeWorker();
    await worker.tick();
    await jest.advanceTimersByTimeAsync(799);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
  });

  it('does not overwrite an earlier command deadline notified during a tick', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const worker = makeWorker();
    const active = worker.tick();
    worker.scheduleDeadline(Date.now() + 1_000);
    finish({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { worlds: [], nextEventAt: Date.now() + 4_000 },
        }),
    });
    await active;
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { worlds: [], nextEventAt: null },
        }),
    });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
  });

  it('avoids spinning on overdue events and clears accelerated timers on shutdown', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { worlds: [], nextEventAt: Date.now() - 1 },
        }),
    });
    const worker = makeWorker();
    await worker.tick();
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('recovers a lost command notification from one watched-world metadata batch', async () => {
    const gateway = new KingdomsGateway();
    const emit = jest.fn();
    gateway.server = { to: () => ({ emit }) } as unknown as Namespace;
    await gateway.watch(
      {
        id: 'socket-1',
        rooms: new Set(['socket-1']),
        join: jest.fn(),
        leave: jest.fn(),
      } as unknown as Socket,
      { worldId: 'world-1' },
    );
    gateway.publishRevision('world-1', 3);
    emit.mockClear();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            revisions: [{ id: 'world-1', revision: 4 }],
            nextEventAt: null,
            realtime: {
              capability: 'revision-push-v1',
              notificationsConfigured: true,
            },
          },
        }),
    });
    const worker = new KingdomsWorker(
      config({
        KINGDOMS_WEB_ORIGIN: 'http://localhost:3000',
        KINGDOMS_WORKER_SECRET: 'test-worker-secret-at-least-32-characters',
      }),
      gateway,
    );
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: '{"limit":10,"watchedWorldIds":["world-1"]}',
      }),
    );
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenNthCalledWith(1, 'kingdoms:revision', {
      worldId: 'world-1',
      revision: 4,
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'kingdoms:revision', {
      worldId: 'world-1',
      revision: 4,
    });
    worker.onModuleDestroy();
  });

  it('does not advertise live when a partially upgraded web lacks durable revision recovery', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            realtime: {
              capability: 'revision-push-v1',
              notificationsConfigured: true,
            },
          },
        }),
    });
    const worker = makeWorker();
    await worker.tick();
    expect(health).toHaveBeenLastCalledWith(false);
    worker.onModuleDestroy();
  });

  it('bounds catchup responses and rejects hidden/malformed revision metadata', async () => {
    const worker = makeWorker();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            revisions: Array.from({ length: 513 }, (_, index) => ({
              id: `world-${index}`,
              revision: 1,
            })),
          },
        }),
    });
    await worker.tick();
    expect(publish).not.toHaveBeenCalled();
    expect(health).toHaveBeenLastCalledWith(false);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            revisions: [{ id: '../invalid', revision: 1 }],
          },
        }),
    });
    await worker.tick();
    expect(publish).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            worlds: [],
            revisions: [{ id: 'world-1', revision: 2, troops: { guard: 500 } }],
          },
        }),
    });
    await worker.tick();
    expect(publish).not.toHaveBeenCalled();
    worker.onModuleDestroy();
  });
});
