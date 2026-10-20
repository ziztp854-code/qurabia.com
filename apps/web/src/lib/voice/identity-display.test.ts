import { beforeEach, describe, expect, it, vi } from 'vitest';
import { optionalVoiceDisplayIdentity } from './identity';
import type { PublicIdentity } from '@/lib/community/contracts';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  current: vi.fn(),
  user: vi.fn(),
  community: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: mocks.session,
  isSessionUserCurrent: mocks.current,
}));
vi.mock('@/lib/auth/prisma', () => ({
  getPrismaClient: () => ({ user: { findUnique: mocks.user } }),
}));
vi.mock('./community-identity', () => ({ voiceCommunityIdentities: mocks.community }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'self', tokenVersion: 3, name: 'اسم قديم', role: 'OWNER' },
  });
  mocks.current.mockReturnValue(true);
  mocks.user.mockResolvedValue({
    id: 'self',
    accountNumber: 123456789,
    name: 'اسم الحساب',
    image: null,
    role: 'USER',
    status: 'ACTIVE',
    tokenVersion: 3,
    subscriptions: [],
    profile: { displayName: 'الاسم الحالي', avatarUrl: '/api/profile/avatar/self' },
  });
  const identity: PublicIdentity = {
    userId: 'self',
    accountNumber: 123456789,
    name: 'الاسم الحالي',
    username: 'player',
    avatarUrl: null,
    badges: [],
    primaryBadge: null,
    frame: null,
    effect: null,
  };
  mocks.community.mockResolvedValue(new Map([['self', identity]]));
});

describe('voice SSR display identity', () => {
  it('uses the current account and grants without exposing tokenVersion to client props', async () => {
    const identity = await optionalVoiceDisplayIdentity();
    expect(identity).toMatchObject({
      id: 'self',
      name: 'الاسم الحالي',
      accountNumber: 123456789,
      image: '/api/profile/avatar/self',
      accountBadges: [],
      communityIdentity: { userId: 'self', accountNumber: 123456789 },
    });
    expect(identity).not.toHaveProperty('tokenVersion');
    expect(mocks.current).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'self', tokenVersion: 3 }),
      expect.objectContaining({ id: 'self', tokenVersion: 3, role: 'USER' }),
    );
  });
  it('keeps anonymous and revoked sessions in the signed-out entry state', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect(await optionalVoiceDisplayIdentity()).toBeNull();
    mocks.current.mockReturnValueOnce(false);
    expect(await optionalVoiceDisplayIdentity()).toBeNull();
    expect(mocks.community).not.toHaveBeenCalled();
  });
});
