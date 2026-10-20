import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicIdentity } from '@/lib/community/contracts';
import { syncVoiceCommunityIdentity, voiceCommunityIdentities } from './community-identity';
import type { VoiceParticipant, VoiceRoomState } from './types';
import { createRoomSchema } from './schemas';
import { voiceSnapshot } from './room-state';

const mocks = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock('@/lib/community/service', () => ({ getUserIdentities: mocks.batch }));
const publicIdentity = (userId = 'user'): PublicIdentity => ({
  userId,
  accountNumber: 123456789,
  name: 'اسم البروفايل',
  username: 'player',
  avatarUrl: null,
  badges: [],
  frame: null,
  effect: null,
  primaryBadge: null,
});
const participant = (): VoiceParticipant => ({
  id: 'user',
  name: 'اسم الغرفة',
  image: null,
  tokenVersion: 3,
  accountBadges: ['knight'],
  role: 'listener',
  seatIndex: null,
  handRaised: false,
  requestedSeat: null,
  muted: true,
  moderatorMuted: true,
  joinedAt: 1000,
  lastSeenAt: 2000,
});
beforeEach(() => vi.resetAllMocks());

describe('existing SFU community identity enrichment', () => {
  it('resolves all requested users in one deduplicated batch', async () => {
    const identities = new Map([['user', publicIdentity()]]);
    mocks.batch.mockResolvedValue(identities);
    expect(await voiceCommunityIdentities(['user', 'user', 'other'])).toBe(identities);
    expect(mocks.batch).toHaveBeenCalledExactlyOnceWith(['user', 'other']);
  });
  it('keeps media available and disables optional decoration if the catalog is unavailable', async () => {
    mocks.batch.mockRejectedValue(new Error('database unavailable'));
    expect(await voiceCommunityIdentities(['user'])).toEqual(new Map());
    expect(await voiceCommunityIdentities([])).toEqual(new Map());
    expect(mocks.batch).toHaveBeenCalledTimes(1);
  });
  it('adds only current account display metadata without changing real SFU privileges or legacy badges', () => {
    const member = participant();
    const before = { ...member };
    const resolved = publicIdentity();
    syncVoiceCommunityIdentity(member, resolved);
    expect(member).toEqual({ ...before, accountNumber: 123456789, communityIdentity: resolved });
    expect(member.role).toBe('listener');
    expect(member.muted).toBe(true);
    expect(member.moderatorMuted).toBe(true);
    expect(member.accountBadges).toEqual(['knight']);
  });
  it('replaces revoked/expired grants and removes stale cached decoration on lookup failure', () => {
    const member = participant();
    const previous = publicIdentity();
    previous.effect = {
      id: 'royal',
      name: 'دخول ملكي',
      description: '',
      kind: 'EFFECT',
      tier: 'royal',
      token: 'royal',
      assetUrl: null,
      archived: false,
      free: false,
    };
    syncVoiceCommunityIdentity(member, previous);
    syncVoiceCommunityIdentity(member, publicIdentity());
    expect(member.communityIdentity?.effect).toBeNull();
    syncVoiceCommunityIdentity(member, undefined);
    expect(member.communityIdentity).toBeUndefined();
    expect(member.accountNumber).toBe(123456789);
  });
  it('does not attach another account’s display entitlements', () => {
    const member = participant();
    syncVoiceCommunityIdentity(member, publicIdentity('other'));
    expect(member.communityIdentity).toBeUndefined();
    expect(member.accountNumber).toBeUndefined();
  });

  it('keeps public community metadata while the existing snapshot strips session and gift internals', () => {
    const member = participant();
    member.lastGiftAt = 123;
    syncVoiceCommunityIdentity(member, publicIdentity());
    const state: VoiceRoomState = {
      settings: createRoomSchema.parse({ name: 'مجلس تحدي لايف' }),
      host: member,
      createdAt: 1000,
      active: true,
      lockedSeats: [],
      participants: [member],
      messages: [],
      bannedUsers: [],
    };
    const snapshot = voiceSnapshot('room', state, 7, member.id);
    expect(snapshot.me?.communityIdentity).toEqual(publicIdentity());
    expect(snapshot.me?.accountNumber).toBe(123456789);
    expect(snapshot.me?.tokenVersion).toBeUndefined();
    expect(snapshot.me?.lastGiftAt).toBeUndefined();
    expect(snapshot.me?.role).toBe('listener');
    expect(member.tokenVersion).toBe(3);
    expect(member.lastGiftAt).toBe(123);
  });
});
