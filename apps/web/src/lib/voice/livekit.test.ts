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
} from './livekit';
import type { VoiceParticipant, VoiceSnapshot } from './types';
const mocks = vi.hoisted(() => ({
  snapshot: undefined as unknown,
  list: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  mute: vi.fn(),
}));
vi.mock('./repository', () => ({
  withVoiceMediaSnapshot: async (_id: string, work: (snapshot: unknown) => unknown) =>
    work(mocks.snapshot),
}));
vi.mock('livekit-server-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('livekit-server-sdk')>();
  return {
    ...actual,
    RoomServiceClient: class {
      listParticipants = mocks.list;
      updateParticipant = mocks.update;
      removeParticipant = mocks.remove;
      mutePublishedTrack = mocks.mute;
    },
  };
});
const speaker: VoiceParticipant = {
  id: 'member-1',
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
  vi.stubEnv('LIVEKIT_URL', 'ws://127.0.0.1:7890');
  vi.stubEnv('LIVEKIT_INTERNAL_URL', 'ws://127.0.0.1:7880');
  vi.stubEnv('LIVEKIT_API_KEY', 'local-test');
  vi.stubEnv('LIVEKIT_API_SECRET', 'this-is-only-a-unit-test-secret-32');
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([]);
});
describe('voice SFU admission', () => {
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
    expect(JSON.parse(decoded.metadata!)).toEqual({ voiceSessionVersion: 0 });
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
      { identity: speaker.id, tracks: [{ sid: 'mic-track', source: 2 }] },
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
  it('kicks removed identities including old-token reconnects', async () => {
    mocks.list.mockResolvedValue([{ identity: 'removed-user', tracks: [] }]);
    mocks.snapshot = { room: { active: true }, participants: [speaker] };
    await reconcileVoiceMedia('one-room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-one-room', 'removed-user');
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('evicts all connected participants after room closes', async () => {
    mocks.list.mockResolvedValue([{ identity: speaker.id, tracks: [] }]);
    mocks.snapshot = { room: { active: false }, participants: [speaker] };
    await reconcileVoiceMedia('one-room');
    expect(mocks.remove).toHaveBeenCalledWith('tahaddi-voice-one-room', speaker.id);
  });
  it('waits for every pending SFU write before a failed reconciliation releases its lock', async () => {
    mocks.list.mockResolvedValue([
      { identity: speaker.id, tracks: [] },
      { identity: 'other', tracks: [] },
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
