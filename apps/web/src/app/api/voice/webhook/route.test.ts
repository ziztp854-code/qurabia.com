import { createHash } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessToken } from 'livekit-server-sdk';
import { POST } from './route';
vi.stubGlobal('TextEncoder', TextEncoder);
vi.stubGlobal('TextDecoder', TextDecoder);
vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
const mocks = vi.hoisted(() => ({ reconcile: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/voice/livekit', () => ({
  VOICE_MEDIA_ROOM_PREFIX: 'tahaddi-voice-',
  voiceMediaConfig: mocks.config,
  reconcileVoiceMedia: mocks.reconcile,
}));
const secret = 'only-test-webhook-secret-with-32-characters';
const body = JSON.stringify({
  event: 'participant_joined',
  id: 'EV_test',
  room: { name: 'tahaddi-voice-room-id' },
  participant: { identity: 'user-id' },
});
async function signature(raw: string) {
  const token = new AccessToken('test-key', secret);
  token.sha256 = createHash('sha256').update(raw).digest('base64');
  return token.toJwt();
}
function request(raw: string, authorization?: string) {
  return new Request('http://localhost/api/voice/webhook', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
    body: raw,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ apiKey: 'test-key', apiSecret: secret });
  mocks.reconcile.mockResolvedValue(undefined);
});
describe('signed media join webhook', () => {
  it('rejects unsigned events before any SFU permissions change', async () => {
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('rejects a modified body even with an otherwise valid signature', async () => {
    const auth = await signature(body);
    expect((await POST(request(body.replace('user-id', 'attacker'), auth))).status).toBe(401);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('reconciles a valid signed join using fresh server membership', async () => {
    expect((await POST(request(body, await signature(body)))).status).toBe(200);
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith('room-id');
  });
  it('bounds raw request bytes before parsing or authenticating', async () => {
    expect((await POST(request('x'.repeat(65_537), 'invalid'))).status).toBe(413);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it('does not touch unrelated SFU rooms', async () => {
    const unrelated = body.replace('tahaddi-voice-room-id', 'unrelated');
    expect((await POST(request(unrelated, await signature(unrelated)))).status).toBe(200);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
