import { afterEach, expect, it, vi } from 'vitest';
import { voiceRequest } from './voice-client';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('bounds a stalled mutation without retrying it', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const result = voiceRequest('rooms/room/leave', {}).catch((error: Error) => error);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({
    name: 'VoiceRequestError',
    code: 'REQUEST_TIMEOUT',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
});

it('keeps the deadline active until the response body finishes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => new Promise(() => {}),
  }));
  const result = voiceRequest('rooms').catch((error: Error) => error);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toMatchObject({
    code: 'REQUEST_TIMEOUT',
  });
});

it('cancels an active request when its owner aborts', async () => {
  vi.useFakeTimers();
  const owner = new AbortController();
  const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const reason = new Error('Owner left the page');
  const result = voiceRequest('rooms', undefined, 'GET', { signal: owner.signal })
    .catch((error: Error) => error);
  owner.abort(reason);
  await vi.advanceTimersByTimeAsync(0);
  expect(await Promise.race([result, Promise.resolve('still pending')])).toBe(reason);
  expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not send a request for an already cancelled owner', async () => {
  vi.useFakeTimers();
  const owner = new AbortController();
  owner.abort();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(voiceRequest('rooms', undefined, 'GET', { signal: owner.signal }))
    .rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('returns successful data and releases the deadline', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rooms: [] }) }));
  await expect(voiceRequest('rooms')).resolves.toEqual({ rooms: [] });
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves server status and error codes without retrying', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({ error: 'غير مسموح', code: 'ROOM_DENIED' }),
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(voiceRequest('rooms/room/events', { type: 'close' })).rejects.toMatchObject({
    message: 'غير مسموح', status: 403, code: 'ROOM_DENIED',
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
