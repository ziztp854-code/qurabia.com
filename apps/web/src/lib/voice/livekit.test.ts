import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TextEncoder, TextDecoder } from 'node:util';
vi.stubGlobal('TextEncoder', TextEncoder);
vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
vi.stubGlobal('TextDecoder', TextDecoder);
import { TokenVerifier } from 'livekit-server-sdk';
import {
  canPublishVoice,
  createVoiceToken,
  reconcileVoiceMedia,
  voiceMediaConfig,
  VoiceMediaUnavailable,
  notifyVoiceRoomChanged,
} from './livekit';
import type { VoiceMediaLedger, VoiceParticipant, VoiceSnapshot } from './types';
import { VoiceHttpError } from './http';
import { synchronizeVoiceMedia } from './media-sync';
import { markChangedCloudGrants } from './cloud-grants';
const mocks = vi.hoisted(() => ({
  snapshot: undefined as unknown,
  list: vi.fn(),
  send: vi.fn(),
  delivery: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  mute: vi.fn(),
  ledger: {} as VoiceMediaLedger,
  checkpoint: { checkedAt: 0 },
  busy: false,
}));
vi.mock('./message-delivery', () => ({ voiceMessageDelivery: mocks.delivery }));
vi.mock('./repository', () => ({
  withVoiceMediaSnapshot: async (
    _id: string,
    work: (
      snapshot: unknown,
      ledger: VoiceMediaLedger,
      checkpoint: { checkedAt: number },
    ) => unknown,
    options?: { skipBusy?: boolean },
  ) => {
    if (mocks.busy && options?.skipBusy) throw new VoiceHttpError(409, 'busy', 'MEDIA_BUSY');
    return work(mocks.snapshot, mocks.ledger, mocks.checkpoint);
  },
}));
vi.mock('livekit-server-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-server-sdk')>();
  return {
    ...actual,
    RoomServiceClient: class {
      sendData = mocks.send;
      listParticipants = mocks.list;
      updateParticipant = mocks.update;
      removeParticipant = mocks.remove;
      mutePublishedTrack = mocks.mute;
    },
  };
});
const speaker: VoiceParticipant = {
  id: 'member-1',
  membershipId: '11111111-1111-4111-8111-111111111111',
  name: 'عضو',
  image: null,
  role: 'speaker',
  seatIndex: 1,
  muted: false,
  moderatorMuted: false,
  handRaised: false,
  requestedSeat: null,
  joinedAt: 1,
  lastSeenAt: 1,
};
beforeEach(() => {
  vi.stubEnv('LIVEKIT_MODE', 'gateway');
  vi.stubEnv('LIVEKIT_URL', 'ws://127.0.0.1:7890');
  vi.stubEnv('LIVEKIT_INTERNAL_URL', 'ws://127.0.0.1:7880');
  vi.stubEnv('LIVEKIT_API_KEY', 'local-test');
  vi.stubEnv('LIVEKIT_API_SECRET', 'this-is-only-a-unit-test-secret-32');
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([]);
  mocks.ledger = {};
  mocks.checkpoint.checkedAt = 0;
  mocks.busy = false;
});
describe('voice SFU admission', () => {
  it('reports pending enforcement when the media configuration is unavailable', async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', '');
    const snapshot = { room: { active: true }, participants: [speaker] } as VoiceSnapshot;
    mocks.snapshot = snapshot;
    await expect(reconcileVoiceMedia('one-room')).rejects.toBeInstanceOf(VoiceMediaUnavailable);
    await expect(synchronizeVoiceMedia('one-room', snapshot)).resolves.toMatchObject({
      mediaSyncPending: true,
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('fails closed with absent or insecure configuration', async () => {
    vi.stubEnv('LIVEKIT_API_SECRET', '');
    expect(voiceMediaConfig()).toBeNull();
    await expect(createVoiceToken('room', speaker)).rejects.toBeInstanceOf(VoiceMediaUnavailable);
    vi.stubEnv('LIVEKIT_API_SECRET', 'test');
    vi.stubEnv('LIVEKIT_URL', 'ws://public.example');
    expect(voiceMediaConfig()).toBeNull();
    vi.stubEnv('LIVEKIT_URL', 'wss://user:password@example.com');
    expect(voiceMediaConfig()).toBeNull();
  });
  it('mints short-lived room and identity scoped microphone-only grants from current role', async () => {
    const response = await createVoiceToken('one-room', speaker);
    const decoded = await new TokenVerifier(
      'local-test',
      'this-is-only-a-unit-test-secret-32',
    ).verify(response.token);
    expect(decoded.sub).toBe('member-1');
    expect(decoded.video?.room).toBe('tahaddi-voice-one-room');
    expect(decoded.video?.canPublish).toBe(true);
    expect(decoded.video?.canSubscribe).toBe(true);
    expect(decoded.video?.canPublishSources).toEqual(['microphone']);
    expect(decoded.video?.canPublishData).toBe(false);
    expect(decoded.exp! - decoded.nbf!).toBe(60);
    expect(response.canPublish).toBe(true);
    expect(JSON.parse(decoded.metadata!)).toEqual({
      voiceSessionVersion: 0,
      voiceMembershipId: speaker.membershipId,
    });
    expect(decoded.video?.canUpdateOwnMetadata).toBe(false);
    expect(response).not.toHaveProperty('apiSecret');
  });
  it('requires a distinct private SFU origin so clients cannot skip admission', () => {
    vi.stubEnv('LIVEKIT_INTERNAL_URL', '');
    expect(voiceMediaConfig()).toBeNull();
    vi.stubEnv('LIVEKIT_INTERNAL_URL', 'http://127.0.0.1:7890');
    expect(voiceMediaConfig()).toBeNull();
  });
  it('never grants listeners microphone publication', async () => {
    const response = await createVoiceToken('one-room', {
      ...speaker,
      role: 'listener',
      seatIndex: null,
    });
    const decoded = await new TokenVerifier(
      'local-test',
      'this-is-only-a-unit-test-secret-32',
    ).verify(response.token);
    expect(decoded.video?.canPublish).toBe(false);
    expect(decoded.video?.canSubscribe).toBe(true);
  });
  it('requires an actual seat, speaking role and no moderation mute', () => {
    expect(canPublishVoice(speaker)).toBe(true);
    expect(canPublishVoice({ ...speaker, role: 'listener' })).toBe(false);
    expect(canPublishVoice({ ...speaker, seatIndex: null })).toBe(false);
    expect(canPublishVoice({ ...speaker, moderatorMuted: true })).toBe(false);
    expect(canPublishVoice(null)).toBe(false);
  });
  it('revokes SFU publish rights and mutes already published tracks after moderator mute', async () => {
    mocks.list.mockResolvedValue([
      {
        identity: speaker.id,
        metadata: JSON.stringify({
          voiceMembershipId: speaker.membershipId,
          voiceSessionVersion: 0,
        }),
        tracks: [{ sid: 'mic-track', source: 2 }],
      },
    ]);
    const snapshot = {
      room: { active: true },
      participants: [{ ...speaker, moderatorMuted: true }],
    } as VoiceSnapshot;
    mocks.snapshot = snapshot;
    await reconcileVoiceMedia('one-room', { ...snapshot, participants: [speaker] });
    expect(mocks.update).toHaveBeenCalledWith(
      'tahaddi-voice-one-room',
      speaker.id,
      undefined,
      expect.objectContaining({ canPublish: false, canSubscribe: true }),
    );
    expect(mocks.mute).toHaveBeenCalledWith(
      'tahaddi-voice-one-room',
      speaker.id,
      'mic-track',
      true,
    );
  });
  it('removes a late connection from an older membership of the same identity', async () => {
    mocks.snapshot = { room: { active: true }, participants: [speaker] };
    mocks.list.mockResolvedValue([
      {
        identity: speaker.id,
        metadata: JSON.stringify({ voiceMembershipId: '22222222-2222-4222-8222-222222222222' }),
        tracks: [],
      },
    ]);
    await reconcileVoiceMedia('one-room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-one-room', speaker.id);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('kicks removed identities including old-token reconnects', async () => {
    mocks.list.mockResolvedValue([{ identity: 'removed-user', tracks: [] }]);
    mocks.snapshot = { room: { active: true }, participants: [speaker] };
    await reconcileVoiceMedia('one-room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-one-room', 'removed-user');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('evicts all connected participants after room closes', async () => {
    mocks.list.mockResolvedValue([
      {
        identity: speaker.id,
        metadata: JSON.stringify({
          voiceMembershipId: speaker.membershipId,
          voiceSessionVersion: 0,
        }),
        tracks: [],
      },
    ]);
    mocks.snapshot = { room: { active: false }, participants: [speaker] };
    await reconcileVoiceMedia('one-room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-one-room', speaker.id);
  });
  it('waits for every pending SFU write before a failed reconciliation releases its lock', async () => {
    mocks.list.mockResolvedValue([
      {
        identity: speaker.id,
        metadata: JSON.stringify({
          voiceMembershipId: speaker.membershipId,
          voiceSessionVersion: 0,
        }),
        tracks: [],
      },
      {
        identity: 'other',
        metadata: JSON.stringify({
          voiceMembershipId: speaker.membershipId,
          voiceSessionVersion: 0,
        }),
        tracks: [],
      },
    ]);
    mocks.snapshot = {
      room: { active: true },
      participants: [speaker, { ...speaker, id: 'other' }],
    };
    let finish!: () => void;
    mocks.update
      .mockImplementationOnce(() => Promise.reject(new Error('failed-update')))
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
    let settled = false;
    const work = reconcileVoiceMedia('one-room').catch((error) => {
      settled = true;
      return error;
    });
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);
    finish();
    expect((await work).message).toBe('failed-update');
  });
  it('propagates failed SFU enforcement rather than claiming successful moderation', async () => {
    mocks.list.mockRejectedValue(new Error('unreachable'));
    await expect(reconcileVoiceMedia('one-room', {} as VoiceSnapshot)).rejects.toThrow(
      'unreachable',
    );
  });
});

describe('LiveKit Cloud strict revocation', () => {
  beforeEach(() => {
    vi.stubEnv('LIVEKIT_MODE', 'cloud');
    vi.stubEnv('LIVEKIT_URL', 'wss://tahaddi-test.livekit.cloud');
    vi.stubEnv('LIVEKIT_INTERNAL_URL', '');
    mocks.snapshot = { room: { active: true }, participants: [speaker] };
  });
  const grant = () => ({
    active: true,
    canPublish: true,
    tokenVersion: 0,
    joinedAt: speaker.joinedAt,
    membershipId: speaker.membershipId,
    revokedBefore: 0,
  });
  it('requires explicit Cloud mode and an exact TLS Cloud project hostname', () => {
    expect(voiceMediaConfig()?.mode).toBe('cloud');
    for (const url of [
      'wss://evil.livekit.cloud.example',
      'wss://livekit.cloud',
      'wss://test.livekit.cloud/path',
      'ws://test.livekit.cloud',
      'wss://test.livekit.cloud:7880',
    ]) {
      vi.stubEnv('LIVEKIT_URL', url);
      expect(voiceMediaConfig()).toBeNull();
    }
    vi.stubEnv('LIVEKIT_URL', 'wss://tahaddi-test.livekit.cloud');
    vi.stubEnv('LIVEKIT_INTERNAL_URL', 'http://localhost:7880');
    expect(voiceMediaConfig()).toBeNull();
  });
  it('uses distinct Cloud identities for separate membership generations', async () => {
    const ledger: VoiceMediaLedger = {};
    const first = await createVoiceToken('room', speaker, 0, ledger);
    const changed = { ...speaker, membershipId: '22222222-2222-4222-8222-222222222222' };
    mocks.ledger = ledger;
    mocks.snapshot = { room: { active: true }, participants: [changed] };
    await reconcileVoiceMedia('room');
    const second = await createVoiceToken('room', changed, 0, ledger);
    const verifier = new TokenVerifier('local-test', 'this-is-only-a-unit-test-secret-32');
    const a = await verifier.verify(first.token);
    const b = await verifier.verify(second.token);
    expect(a.sub).not.toBe(b.sub);
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-room', a.sub, { revokeTokenTs: expect.any(BigInt) });
    expect(JSON.parse(b.metadata!).voiceUserId).toBe(speaker.id);
    expect(ledger[a.sub!].active).toBe(false);
    expect(ledger[b.sub!].active).toBe(true);
  });
  it('keeps a later generation distinct from a timed-out removal target', async () => {
    const ledger: VoiceMediaLedger = {};
    const first = await createVoiceToken('room', speaker, 0, ledger);
    const verifier = new TokenVerifier('local-test', 'this-is-only-a-unit-test-secret-32');
    const firstId = (await verifier.verify(first.token)).sub!;
    const changed = { ...speaker, membershipId: '22222222-2222-4222-8222-222222222222' };
    mocks.ledger = ledger;
    mocks.snapshot = { room: { active: true }, participants: [changed] };
    mocks.remove.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue(undefined);
    await expect(reconcileVoiceMedia('room')).rejects.toThrow('timeout');
    expect(ledger[firstId].active).toBe(true);
    await reconcileVoiceMedia('room');
    const second = await createVoiceToken('room', changed, 0, ledger);
    const secondId = (await verifier.verify(second.token)).sub!;
    const connected = new Set([secondId]);
    connected.delete(firstId); // Model the delayed old removal arriving after the new join.
    expect(connected.has(secondId)).toBe(true);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove.mock.calls.every((call) => call[1] === firstId)).toBe(true);
  });
  it('quarantines a generation after an uncertain removal even if permissions revert', async () => {
    const ledger: VoiceMediaLedger = {};
    await createVoiceToken('room', speaker, 0, ledger);
    mocks.ledger = ledger;
    mocks.snapshot = { room: { active: true }, participants: [{ ...speaker, moderatorMuted: true }] };
    markChangedCloudGrants({ active: true, participants: [{ ...speaker, moderatorMuted: true }], mediaGrants: ledger } as any);
    mocks.remove.mockRejectedValueOnce(new Error('timeout'));
    await expect(reconcileVoiceMedia('room')).rejects.toThrow('timeout');
    mocks.snapshot = { room: { active: true }, participants: [speaker] };
    await expect(createVoiceToken('room', speaker, 0, ledger)).rejects.toMatchObject({ code: 'MEDIA_RETRY' });
  });
  it('targets only current Cloud generations for a private message', async () => {
    const token = await createVoiceToken('room', speaker, 0, mocks.ledger);
    const claims = await new TokenVerifier('local-test', 'this-is-only-a-unit-test-secret-32').verify(token.token);
    mocks.delivery.mockResolvedValue({ message: { id: 'm' }, recipients: [speaker.id], cursor: 9 });
    await notifyVoiceRoomChanged('room', 9, 'm');
    expect(mocks.send).toHaveBeenCalledWith('tahaddi-voice-room', expect.any(Uint8Array), expect.anything(), {
      topic: 'tahaddi-voice-message-v1', destinationIdentities: [claims.sub],
    });
  });
  it('records every issued token in a server ledger and refuses untracked issuance', async () => {
    await expect(createVoiceToken('room', speaker)).rejects.toBeInstanceOf(VoiceMediaUnavailable);
    const ledger: VoiceMediaLedger = {};
    const token = await createVoiceToken('room', speaker, 0, ledger);
    const claims = await new TokenVerifier('local-test', 'this-is-only-a-unit-test-secret-32').verify(token.token);
    expect(ledger[claims.sub!]).toEqual({ ...grant(), userId: speaker.id });
    expect(token).not.toHaveProperty('ledger');
  });
  it('revokes removed identities even when they are offline at the SFU', async () => {
    mocks.ledger['offline-member'] = grant();
    const before = Math.ceil(Date.now() / 1000) + 1;
    await reconcileVoiceMedia('room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-room', 'offline-member', {
      revokeTokenTs: expect.any(BigInt),
    });
    expect(mocks.ledger['offline-member'].active).toBe(false);
    expect(mocks.ledger['offline-member'].revokedBefore).toBeGreaterThanOrEqual(before);
  });
  it.each([
    { ...speaker, moderatorMuted: true },
    { ...speaker, role: 'listener' as const, seatIndex: null },
    { ...speaker, tokenVersion: 1 },
    { ...speaker, joinedAt: 2 },
    { ...speaker, membershipId: '22222222-2222-4222-8222-222222222222' },
  ])(
    'invalidates cached grants when rights or session/join version changes: %j',
    async (member) => {
      mocks.ledger[speaker.id] = grant();
      mocks.snapshot = { room: { active: true }, participants: [member] };
      await reconcileVoiceMedia('room');
      expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-room', speaker.id, {
        revokeTokenTs: expect.any(BigInt),
      });
      expect(mocks.ledger[speaker.id].active).toBe(false);
    },
  );
  it('revokes legacy cloud grants and refuses issuing tokens for legacy members', async () => {
    mocks.ledger[speaker.id] = { ...grant(), membershipId: undefined };
    await reconcileVoiceMedia('room');
    expect(mocks.remove).toHaveBeenCalled();
    await expect(
      createVoiceToken('room', { ...speaker, membershipId: undefined }, 0, {}),
    ).rejects.toMatchObject({ code: 'NOT_MEMBER' });
  });
  it('never reuses the identity of an inactive grant even while its cutoff is pending', async () => {
    const ledger: VoiceMediaLedger = {
      'voice-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa': {
        ...grant(), userId: speaker.id, active: false, revokedBefore: Math.floor(Date.now() / 1000) + 5,
      },
    };
    const token = await createVoiceToken('room', speaker, 0, ledger);
    const claims = await new TokenVerifier('local-test', 'this-is-only-a-unit-test-secret-32').verify(token.token);
    expect(claims.sub).not.toBe('voice-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });
  it('requires reconciliation before a changed grant can be reissued', async () => {
    const ledger = { [speaker.id]: grant() };
    await expect(
      createVoiceToken('room', { ...speaker, moderatorMuted: true }, 0, ledger),
    ).rejects.toMatchObject({ code: 'MEDIA_RETRY' });
    expect(ledger[speaker.id].active).toBe(true);
  });
  it('removes untracked connections with a strict cutoff', async () => {
    mocks.list.mockResolvedValue([{ identity: 'unknown', tracks: [] }]);
    await reconcileVoiceMedia('room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-room', 'unknown', {
      revokeTokenTs: expect.any(BigInt),
    });
  });
  it('removes a stale connection even when an inactive ledger tombstone exists', async () => {
    mocks.ledger[speaker.id] = { ...grant(), active: false };
    mocks.list.mockResolvedValue([{ identity: speaker.id, metadata: '{}', tracks: [] }]);
    await reconcileVoiceMedia('room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-room', speaker.id, {
      revokeTokenTs: expect.any(BigInt),
    });
  });
  it('preserves a connected participant whose current grant matches the ledger', async () => {
    const token = await createVoiceToken('room', speaker, 0, mocks.ledger);
    const claims = await new TokenVerifier('local-test', 'this-is-only-a-unit-test-secret-32').verify(token.token);
    mocks.list.mockResolvedValue([{
      identity: claims.sub, metadata: claims.metadata, tracks: [],
      permission: { canPublish: true, canSubscribe: true, canPublishData: false, canUpdateMetadata: false, canPublishSources: [2] },
    }]);
    await reconcileVoiceMedia('room');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

it('coalesces periodic SFU checks but never skips forced permission reconciliation', async () => {
  mocks.snapshot = { room: { active: true }, participants: [] };
  mocks.checkpoint.checkedAt = Date.now();
  await reconcileVoiceMedia('room', undefined, true);
  expect(mocks.list).not.toHaveBeenCalled();
  await reconcileVoiceMedia('room');
  expect(mocks.list).toHaveBeenCalledTimes(1);
});
it('does not checkpoint failed SFU reconciliations', async () => {
  mocks.snapshot = { room: { active: true }, participants: [] };
  mocks.list.mockRejectedValue(new Error('network'));
  await expect(reconcileVoiceMedia('room', undefined, true)).rejects.toThrow();
  expect(mocks.checkpoint.checkedAt).toBe(0);
});
it('skips an already running periodic check without skipping forced permission enforcement', async () => {
  mocks.snapshot = { room: { active: true }, participants: [] };
  mocks.busy = true;
  await expect(reconcileVoiceMedia('room', undefined, true)).resolves.toBeUndefined();
  expect(mocks.list).not.toHaveBeenCalled();
  await reconcileVoiceMedia('room');
  expect(mocks.list).toHaveBeenCalledTimes(1);
});

it('sends chat only to explicit authorized recipients and never broadcasts an empty recipient list', async () => {
  const message = { id: 'msg', text: 'أهلًا' };
  mocks.delivery.mockResolvedValue({ message, recipients: ['allowed'], cursor: 12 });
  await notifyVoiceRoomChanged('room', 10, 'msg');
  expect(mocks.send).toHaveBeenCalledWith(
    'tahaddi-voice-room',
    expect.anything(),
    expect.anything(),
    { topic: 'tahaddi-voice-message-v1', destinationIdentities: ['allowed'] },
  );
  mocks.send.mockClear();
  mocks.delivery.mockResolvedValue({ message, recipients: [], cursor: 12 });
  await notifyVoiceRoomChanged('room', 10, 'msg');
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][3]).toEqual({ topic: 'tahaddi-voice-refresh-v1' });
});
