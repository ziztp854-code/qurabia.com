import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ process: vi.fn(), account: vi.fn(), backlog: vi.fn() }));
vi.mock('@/lib/voice/media-sync-queue', () => ({ processNextVoiceMediaJob: mocks.process }));
vi.mock('@/lib/voice/account-voice-outbox', () => ({ processNextAccountVoiceOutboxJob: mocks.account }));
vi.mock('@/lib/voice/account-voice-outbox-health', () => ({ readVoiceBacklog: mocks.backlog }));
import { POST } from './route';
const secret = ['test-only', 'secret-with-at-least-32-characters'].join('-');
const emptyBacklog = { accountPending: 0, roomPending: 0, accountDelayed: 0, roomDelayed: 0, oldestAgeSeconds: null };
function request(auth: string, body = '{"limit":10}') {
  return new Request('http://localhost/api/internal/voice/reconcile/', {
    method: 'POST',
    headers: { authorization: auth, 'content-type': 'application/json' },
    body,
  });
}
describe('internal voice reconciliation endpoint', () => {
  beforeEach(() => {
    vi.stubEnv('VOICE_RECONCILE_SECRET', secret);
    mocks.process.mockReset();
    mocks.account.mockReset().mockResolvedValue('empty');
    mocks.backlog.mockReset().mockResolvedValue(emptyBacklog);
  });
  it('denies missing or invalid authorization without processing jobs', async () => {
    expect((await POST(request('Bearer incorrect'))).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it('processes a bounded batch for an authenticated worker', async () => {
    mocks.process.mockResolvedValue({ processed: 1, failed: 0 });
    const result = await POST(request(`Bearer ${secret}`));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ success: true, data: { processed: 1, failed: 0, backlog: emptyBacklog } });
    expect(mocks.process).toHaveBeenCalledTimes(1);
    expect(mocks.account).toHaveBeenCalledTimes(1);
  });
  it('reports account conversion failures to the scheduler and still processes the room queue', async () => {
    mocks.account.mockResolvedValue('failed');
    mocks.process.mockResolvedValue({ processed: 0, failed: 0 });
    const result = await POST(request(`Bearer ${secret}`));
    expect(await result.json()).toEqual({ success: true, data: { processed: 0, failed: 1, backlog: emptyBacklog } });
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });
  it('does not report readiness if the backlog cannot be read', async () => {
    mocks.process.mockResolvedValue({ processed: 0, failed: 0 });
    mocks.backlog.mockRejectedValue(new Error('database unavailable'));
    const result = await POST(request(`Bearer ${secret}`));
    expect(result.status).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(await result.json())).not.toContain('database unavailable');
  });
  it('rejects unknown inputs', async () => {
    expect((await POST(request(`Bearer ${secret}`, '{"limit":100}'))).status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
