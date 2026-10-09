import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const callbacks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock('next/server', () => ({ after: vi.fn((work: () => Promise<void>) => callbacks.push(work)) }));
import { kingdomsRealtimeCapability, queueKingdomsNotification } from './realtime-notifications';
const env = { KINGDOMS_WORKER_SECRET: 'local-review-secret-at-least-32-characters', NEXT_PUBLIC_REALTIME_URL: 'http://127.0.0.1:3349', NODE_ENV: 'test' };
const change = { worldId: 'world_1', revision: 42, nextEventAt: 1000 };
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  callbacks.length = 0;
  request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, capability: 'revision-push-v1' })));
  vi.stubGlobal('fetch', request);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('revision publication', () => {
  it('proves the reverse path with a bounded credentialed probe containing no game state', async () => {
    expect(await kingdomsRealtimeCapability(env)).toEqual({ capability: 'revision-push-v1', notificationsConfigured: true });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3349/realtime/kingdoms/revision/');
    expect(JSON.parse(init.body)).toEqual({ capability: 'revision-push-v1', probe: true });
    expect(init).toMatchObject({ redirect: 'error', cache: 'no-store', method: 'POST' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    { ...env, KINGDOMS_WORKER_SECRET: 'short' },
    { ...env, NEXT_PUBLIC_REALTIME_URL: '' },
    { ...env, NEXT_PUBLIC_REALTIME_URL: 'https://user:password@example.com' },
    { ...env, NEXT_PUBLIC_REALTIME_URL: 'https://example.com/path' },
    { ...env, NEXT_PUBLIC_REALTIME_URL: 'https://example.com?token=value' },
    { ...env, NEXT_PUBLIC_REALTIME_URL: 'https://example.com#fragment' },
    { ...env, NODE_ENV: 'production' },
  ])('does not enable live updates with invalid publication configuration', async (invalid) => {
    expect((await kingdomsRealtimeCapability(invalid)).notificationsConfigured).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{ success: true }, { success: false, capability: 'revision-push-v1' }, { success: true, capability: 'legacy' }])('requires the peer capability, not merely HTTP success', async (body) => {
    request.mockResolvedValue(new Response(JSON.stringify(body)));
    expect((await kingdomsRealtimeCapability(env)).notificationsConfigured).toBe(false);
  });
  it('falls back on HTTP or transport failure', async () => {
    request.mockResolvedValueOnce(new Response('{}', { status: 503 })).mockRejectedValueOnce(new Error('offline'));
    expect((await kingdomsRealtimeCapability(env)).notificationsConfigured).toBe(false);
    expect((await kingdomsRealtimeCapability(env)).notificationsConfigured).toBe(false);
  });
  it('publishes an exact invalidation body only when the request lifecycle runs after commit', async () => {
    queueKingdomsNotification(change);
    expect(request).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    await callbacks[0]();
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual(change);
  });
  it('rejects negative, unsafe, missing or extra state fields', () => {
    for (const body of [{ ...change, revision: -1 }, { ...change, revision: Number.MAX_SAFE_INTEGER + 1 }, { ...change, nextEventAt: -1 }, { ...change, troops: { guard: 99 } }, { ...change, worldId: '../private' }]) {
      queueKingdomsNotification(body as typeof change);
    }
    expect(callbacks).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();
  });
  it('notification failure cannot turn saved work into a failed command', async () => {
    request.mockRejectedValue(new Error('offline'));
    queueKingdomsNotification(change);
    await expect(callbacks[0]()).resolves.toBeUndefined();
  });
});
