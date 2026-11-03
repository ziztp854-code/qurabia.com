import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  VoiceReconciliationWorker,
  voiceReconciliationEndpoint,
} from './voice-reconciliation.worker.js';

describe('voice reconciliation worker', () => {
  const secret = ['test-only', 'secret-at-least-32-characters'].join('-');
  const emptyBacklog = {
    accountPending: 0,
    roomPending: 0,
    accountDelayed: 0,
    roomDelayed: 0,
    oldestAgeSeconds: null,
  };
  const fetchMock = jest.fn();
  const makeWorker = (overrides: Record<string, string> = {}) =>
    new VoiceReconciliationWorker({
      get: (key: string) =>
        ({
          VOICE_RECONCILE_WEB_ORIGIN: 'http://localhost:3000',
          VOICE_RECONCILE_SECRET: secret,
          ...overrides,
        })[key],
    } as ConfigService);

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('accepts only an origin and requires HTTPS in production', () => {
    expect(voiceReconciliationEndpoint('https://example.com', true)).toBe(
      'https://example.com/api/internal/voice/reconcile/',
    );
    for (const value of [
      'file:///tmp',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com?x=1',
      'https://example.com/#a',
    ]) {
      expect(voiceReconciliationEndpoint(value)).toBeNull();
    }
    expect(voiceReconciliationEndpoint('http://example.com', true)).toBeNull();
  });

  it('identifies each instance and advances successful poll evidence only on success', async () => {
    const worker = makeWorker();
    const other = makeWorker();
    const initial = worker.getReadiness();
    expect(initial.processInstanceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(other.getReadiness().processInstanceId).not.toBe(
      initial.processInstanceId,
    );
    expect(initial.lastSuccessAtMs).toBeNull();
    expect(initial.successSequence).toBe(0);
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { processed: 0, failed: 0, backlog: emptyBacklog },
        }),
    });
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    const first = worker.getReadiness();
    expect(first.successSequence).toBe(1);
    expect(first.lastSuccessAtMs).toBe(Date.now());
    await jest.advanceTimersByTimeAsync(5_000);
    const second = worker.getReadiness();
    expect(second.processInstanceId).toBe(initial.processInstanceId);
    expect(second.successSequence).toBe(2);
    expect(second.lastSuccessAtMs).toBeGreaterThan(first.lastSuccessAtMs!);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      state: 'retrying',
      processInstanceId: initial.processInstanceId,
      lastSuccessAtMs: second.lastSuccessAtMs,
      successSequence: 2,
    });
    worker.onModuleDestroy();
  });

  it('requires successful polls and an empty backlog', async () => {
    const missing = makeWorker({ VOICE_RECONCILE_SECRET: '' });
    missing.onModuleInit();
    expect(missing.getReadiness()).toMatchObject({
      ready: false,
      state: 'misconfigured',
    });
    missing.onModuleDestroy();

    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { processed: 0, failed: 0, backlog: emptyBacklog },
        }),
    });
    const worker = makeWorker();
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'starting',
    });
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'starting',
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: true,
      state: 'ready',
    });
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'retrying',
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'starting',
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: true,
      state: 'ready',
    });
    jest.setSystemTime(Date.now() + 65_001);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'stale',
    });
    worker.onModuleDestroy();
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'stopped',
    });
  });

  it('does not report ready for delayed work when polls process nothing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            processed: 0,
            failed: 0,
            backlog: {
              ...emptyBacklog,
              accountPending: 1,
              accountDelayed: 1,
              oldestAgeSeconds: 5,
            },
          },
        }),
    });
    const worker = makeWorker();
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'backlog_pending',
      connectivity: 'connected',
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { processed: 0, failed: 0, backlog: emptyBacklog },
        }),
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'starting',
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: true,
      state: 'ready',
    });
    worker.onModuleDestroy();
  });

  it('fails closed when aggregate backlog is absent or inconsistent', async () => {
    const worker = makeWorker();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { processed: 0, failed: 0 } }),
    });
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(0);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'retrying',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            processed: 0,
            failed: 0,
            backlog: { ...emptyBacklog, accountDelayed: 1 },
          },
        }),
    });
    await jest.advanceTimersByTimeAsync(5_000);
    expect(worker.getReadiness()).toMatchObject({
      ready: false,
      state: 'retrying',
    });
    worker.onModuleDestroy();
  });

  it('does not start or contact the endpoint if the origin or secret is missing or invalid', async () => {
    const invalidConfigurations: Record<string, string>[] = [
      { VOICE_RECONCILE_SECRET: '' },
      { VOICE_RECONCILE_SECRET: 'short' },
      { VOICE_RECONCILE_WEB_ORIGIN: '' },
    ];
    for (const values of invalidConfigurations) {
      const worker = makeWorker(values);
      worker.onModuleInit();
      await worker.tick();
      worker.onModuleDestroy();
    }
    await jest.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls with a bounded batch at startup and on schedule, then stops', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { processed: 1, failed: 0, backlog: emptyBacklog },
        }),
    });
    const worker = makeWorker();
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/internal/voice/reconcile/',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: '{"limit":10}',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
      }),
    );
    worker.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('prevents overlap and aborts an in-flight request on shutdown', async () => {
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
          data: { processed: 0, failed: 0, backlog: emptyBacklog },
        }),
    });
    await active;
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out a stalled request and retries on the next poll', async () => {
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
    await jest.advanceTimersByTimeAsync(55_000);
    await active;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { processed: 0, failed: 0, backlog: emptyBacklog },
        }),
    });
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
  });

  it('reports failed or malformed results safely and allows subsequent retries', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    fetchMock.mockRejectedValueOnce(
      new Error(`URL and ${secret} must not be logged`),
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { processed: -1, failed: 0 } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { processed: 0, failed: 1 } }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { processed: 1, failed: 0, backlog: emptyBacklog },
        }),
    });
    const worker = makeWorker();
    await worker.tick();
    await worker.tick();
    await worker.tick();
    await worker.tick();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
    worker.onModuleDestroy();
  });
});
