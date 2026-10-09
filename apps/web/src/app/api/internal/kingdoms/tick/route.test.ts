import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const dependencies = vi.hoisted(() => ({ tick: vi.fn(), capability: vi.fn() }));
vi.mock('@/lib/kingdoms/repository', () => ({ tickKingdomWorlds: dependencies.tick }));
vi.mock('@/lib/kingdoms/realtime-notifications', () => ({ kingdomsRealtimeCapability: dependencies.capability }));
import { POST } from './route';
const secret = 'local-review-worker-secret-at-least-32-characters';
function request(body = '', authorization = `Bearer ${secret}`) {
  return new Request('http://localhost/api/internal/kingdoms/tick/', { method: 'POST', headers: { authorization }, body });
}
beforeEach(() => {
  vi.stubEnv('KINGDOMS_WORKER_SECRET', secret);
  dependencies.tick.mockResolvedValue({ worlds: [], revisions: [{ id: 'world_1', revision: 8 }], nextEventAt: null });
  dependencies.capability.mockResolvedValue({ capability: 'revision-push-v1', notificationsConfigured: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('central revision recovery route', () => {
  it('validates credentials before parsing or reading the database', async () => {
    const response = await POST(request('invalid JSON', 'Bearer wrong'));
    expect(response.status).toBe(401);
    expect(dependencies.tick).not.toHaveBeenCalled();
    expect(dependencies.capability).not.toHaveBeenCalled();
  });
  it('keeps empty legacy requests compatible', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(dependencies.tick).toHaveBeenCalledExactlyOnceWith(undefined, undefined);
    expect(await response.json()).toMatchObject({ success: true, data: { revisions: [{ id: 'world_1', revision: 8 }], realtime: { capability: 'revision-push-v1', notificationsConfigured: true } } });
  });
  it('passes only the bounded watched identifiers to central metadata recovery', async () => {
    const response = await POST(request(JSON.stringify({ limit: 10, watchedWorldIds: ['world_1', 'world_2'] })));
    expect(response.status).toBe(200);
    expect(dependencies.tick).toHaveBeenCalledExactlyOnceWith(undefined, ['world_1', 'world_2']);
  });
  it.each(['{', JSON.stringify({ watchedWorldIds: Array.from({ length: 513 }, (_, i) => `world_${i}`) }), JSON.stringify({ watchedWorldIds: ['../private'] }), JSON.stringify({ worldState: {} })])('rejects invalid or extra input before querying', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(dependencies.tick).not.toHaveBeenCalled();
  });
  it('keeps committed tick results even when the notification path is unavailable', async () => {
    dependencies.capability.mockResolvedValue({ capability: 'revision-push-v1', notificationsConfigured: false });
    const response = await POST(request('{}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { realtime: { notificationsConfigured: false } } });
  });
});
