import { afterEach, expect, it, vi } from 'vitest';
import { requestVoiceMediaToken, VoiceMediaTokenError } from './voice-media-token';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('waits for a Cloud revocation cutoff and returns only a freshly authorized token', async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 'MEDIA_RETRY' }) })
    .mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'fresh', url: 'wss://local.test' }),
    });
  vi.stubGlobal('fetch', fetcher);
  const work = requestVoiceMediaToken('room/a', new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await work).toMatchObject({ token: 'fresh' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0][0]).toBe('/api/voice/rooms/room%2Fa/token/');
});
it('does not retry forbidden membership and stops aborted pending retries', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'forbidden' }) });
  vi.stubGlobal('fetch', fetcher);
  await expect(requestVoiceMediaToken('room', new AbortController().signal)).rejects.toBeInstanceOf(
    VoiceMediaTokenError,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  fetcher.mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({ code: 'MEDIA_RETRY' }),
  });
  const abort = new AbortController();
  const work = requestVoiceMediaToken('room', abort.signal).catch((e) => e);
  await vi.advanceTimersByTimeAsync(100);
  abort.abort();
  expect((await work).name).toBe('AbortError');
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('ends a stalled token request so the audio session can recover instead of connecting forever', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const result = requestVoiceMediaToken('room', new AbortController().signal).catch(
    (error: Error) => error,
  );
  await vi.advanceTimersByTimeAsync(12_000);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toBe('still pending');
  await vi.advanceTimersByTimeAsync(33_000);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({
    name: 'Error',
    status: 408,
    code: 'REQUEST_TIMEOUT',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the token deadline until its response body finishes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => new Promise(() => {}),
  }));
  const result = requestVoiceMediaToken('room', new AbortController().signal).catch(
    (error: Error) => error,
  );
  await vi.advanceTimersByTimeAsync(45_000);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({
    status: 408,
    code: 'REQUEST_TIMEOUT',
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels a stalled token request immediately when its audio session leaves', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const owner = new AbortController();
  const reason = new Error('Audio session left');
  const result = requestVoiceMediaToken('room', owner.signal).catch((error: Error) => error);
  owner.abort(reason);
  await vi.advanceTimersByTimeAsync(0);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toBe(reason);
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
