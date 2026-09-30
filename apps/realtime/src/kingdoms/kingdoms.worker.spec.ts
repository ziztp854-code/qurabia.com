import { ConfigService } from '@nestjs/config';
import { KingdomsGateway } from './kingdoms.gateway.js';
import { KingdomsWorker, kingdomWorkerEndpoint } from './kingdoms.worker.js';

describe('Kingdoms persisted event worker', () => {
  const fetchMock = jest.fn();
  const publish = jest.fn();
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
    } as unknown as KingdomsGateway);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    fetchMock.mockReset();
    publish.mockReset();
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
        body: '{"limit":10}',
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
});
