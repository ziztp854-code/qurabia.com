import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextEncoder, TextDecoder } from 'node:util';
vi.stubGlobal('TextEncoder', TextEncoder);
vi.stubGlobal('TextDecoder', TextDecoder);
vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
import { AccessToken, TokenVerifier } from 'livekit-server-sdk';
import { admitVoiceSignal } from './admission';
import type { VoiceParticipant, VoiceSnapshot } from './types';
const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  snapshot: undefined as unknown,
  rate: vi.fn(),
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ user: { findUnique: mocks.account } }),
}));
vi.mock('./identity', () => ({ voiceRateLimit: mocks.rate }));
vi.mock('./repository', () => ({
  withVoiceMediaSnapshot: async (_room: string, fn: (s: unknown) => unknown) => fn(mocks.snapshot),
}));
const member: VoiceParticipant = {
  id: 'user-one',
  name: 'مشارك',
  image: null,
  role: 'speaker',
  seatIndex: 1,
  muted: false,
  moderatorMuted: false,
  handRaised: false,
  requestedSeat: null,
  joinedAt: 1,
  lastSeenAt: 1,
  tokenVersion: 2,
};
const key = 'gateway-unit',
  secret = 'local-unit-secret-with-enough-entropy-only';
async function token(version = 2, room = 'tahaddi-voice-room-one') {
  const t = new AccessToken(key, secret, {
    identity: member.id,
    ttl: 60,
    metadata: JSON.stringify({ voiceSessionVersion: version }),
  });
  t.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: true });
  return t.toJwt();
}
beforeEach(() => {
  vi.stubEnv('LIVEKIT_URL', 'ws://127.0.0.1:7890');
  vi.stubEnv('LIVEKIT_INTERNAL_URL', 'ws://127.0.0.1:7880');
  vi.stubEnv('LIVEKIT_API_KEY', key);
  vi.stubEnv('LIVEKIT_API_SECRET', secret);
  vi.clearAllMocks();
  mocks.account.mockResolvedValue({ status: 'ACTIVE', tokenVersion: 2 });
  mocks.snapshot = { room: { active: true }, participants: [{ ...member }] } as VoiceSnapshot;
});
describe('voice signaling admission', () => {
  it('rechecks role for replayed JWT and downgrades a former speaker to listener', async () => {
    const original = await token();
    (mocks.snapshot as VoiceSnapshot).participants[0] = {
      ...member,
      role: 'listener',
      seatIndex: null,
    };
    const r = await admitVoiceSignal(original);
    const d = await new TokenVerifier(key, secret).verify(r.token);
    expect(d.video?.canPublish).toBe(false);
    expect(d.video?.canSubscribe).toBe(true);
  });
  it('rejects banned/departed members and closed rooms despite a valid old JWT', async () => {
    const original = await token();
    (mocks.snapshot as VoiceSnapshot).participants = [];
    await expect(admitVoiceSignal(original)).rejects.toMatchObject({ status: 403 });
    (mocks.snapshot as VoiceSnapshot).participants = [member];
    (mocks.snapshot as VoiceSnapshot).room.active = false;
    await expect(admitVoiceSignal(original)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects revoked/suspended account and old metadata after the same account rejoins', async () => {
    const original = await token(1);
    await expect(admitVoiceSignal(original)).rejects.toMatchObject({ status: 401 });
    mocks.account.mockResolvedValue({ status: 'SUSPENDED', tokenVersion: 2 });
    await expect(admitVoiceSignal(await token())).rejects.toMatchObject({ status: 401 });
  });
  it('rejects tampered tokens and grants for unrelated rooms', async () => {
    await expect(admitVoiceSignal('invalid.jwt')).rejects.toMatchObject({ status: 401 });
    await expect(admitVoiceSignal(await token(2, 'other-product-room'))).rejects.toMatchObject({
      status: 403,
    });
  });
});
