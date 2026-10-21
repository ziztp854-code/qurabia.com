import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminCommunityCommand,
  followProfile,
  getCommunityRaster,
  getMyCommunityProfile,
  getPublicProfile,
  getUserIdentity,
  getUserIdentities,
  updateMyCommunityProfile,
} from './service';
const mocks = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  });
  return {
    session: vi.fn(),
    rate: vi.fn(),
    preferences: vi.fn(),
    updatePreferences: vi.fn(),
    socialCounts: vi.fn(),
    db: {
      user: model(),
      profile: model(),
      userBadge: model(),
      userCosmetic: model(),
      profileCosmetic: model(),
      communityBadge: model(),
      voicePreference: model(),
      voiceRoom: model(),
      auditLog: model(),
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
  };
});
vi.mock('@/lib/voice/repository', () => ({
  getVoicePreferences: mocks.preferences,
  updateVoicePreferences: mocks.updatePreferences,
}));
vi.mock('@/lib/profile/repository', () => ({ profileSocialCounts: mocks.socialCounts }));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: mocks.session }));
vi.mock('@/lib/auth/prisma', () => ({ getPrismaClient: () => mocks.db }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/subscription/entitlements', () => ({
  getDisplayPlanCode: vi.fn(async () => 'SPECTATOR'),
}));
const actor = {
  id: 'actor',
  role: 'USER',
  name: 'Existing OAuth Name',
  status: 'ACTIVE',
  tokenVersion: 3,
};
const row = () => ({
  id: 'subject',
  accountNumber: 123456789,
  name: 'Subject',
  image: null,
  status: 'ACTIVE',
  role: 'USER',
  createdAt: new Date('2025-01-01'),
  profile: null,
  badges: [],
  cosmetics: [],
});
const item = () => ({
  id: 'entrance-gold',
  name: 'ذهبي',
  description: '',
  kind: 'EFFECT',
  tier: 'gold',
  token: 'gold',
  assetUrl: null,
  free: false,
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const award = () => ({
  id: 'gold-member',
  name: 'ذهبي',
  description: '',
  category: 'DISTINCTION',
  rarity: 'rare',
  assetUrl: null,
  sensitive: false,
  archived: false,
  effectId: 'entrance-gold',
  frameId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const selection = {
  frameId: null,
  effectId: null,
  primaryBadgeId: null,
  nameCardId: null,
  backgroundId: null,
  glowId: null,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: actor.id, role: 'OWNER', tokenVersion: 3 } });
  mocks.rate.mockResolvedValue(true);
  mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
    where.id === actor.id ? { ...actor } : row(),
  );
  mocks.db.user.findUniqueOrThrow.mockResolvedValue({ ...row(), id: actor.id });
  mocks.db.$transaction.mockImplementation(async (run) => run(mocks.db));
  for (const name of [
    'userBadge',
    'userCosmetic',
    'profileCosmetic',
    'communityBadge',
    'voiceRoom',
    'auditLog',
  ] as const)
    mocks.db[name].findMany.mockResolvedValue([]);
  mocks.db.$queryRaw.mockResolvedValue([]);
  mocks.preferences.mockResolvedValue({ following: [], blockedUsers: [], privateProfile: false });
  mocks.socialCounts.mockResolvedValue({ followers: 0, following: 0 });
  mocks.db.voicePreference.upsert.mockResolvedValue({
    state: { following: ['preserved-peer'], privateProfile: false },
    revision: 2,
  });
  mocks.db.voicePreference.updateMany.mockResolvedValue({ count: 1 });
});
describe('community server authority', () => {
  it.each([
    ['cmrw9nc29000004l7a6kkosgy', 'OWNER', 'frame-owner-sapphire'],
    ['cmrw9rfv9000204l72z55ai5b', 'USER', 'frame-amira-rose'],
  ])(
    'resolves the exclusive frame for %s only while its real grant is active',
    async (id, role, frameId) => {
      const frame = { ...item(), id: frameId, kind: 'FRAME' };
      const grant = {
        cosmetic: frame,
        grantedAt: new Date(),
        expiresAt: null,
        revokedAt: null as Date | null,
      };
      mocks.db.profileCosmetic.findMany.mockResolvedValue([frame]);
      mocks.db.user.findUnique.mockResolvedValue({
        ...row(),
        id,
        role,
        profile: { appearance: { ...selection, frameId } },
        cosmetics: [grant],
      });
      expect((await getUserIdentity(id!))?.frame?.id).toBe(frameId);
      grant.revokedAt = new Date();
      expect((await getUserIdentity(id!))?.frame).toBeNull();
    },
  );
  it('resolves the account-exclusive entrance and rejects another account even with a forged grant', async () => {
    const effect = { ...item(), id: 'entrance-amira-rose' };
    const member = {
      ...row(),
      id: 'cmrw9rfv9000204l72z55ai5b',
      profile: { appearance: { ...selection, effectId: effect.id } },
      cosmetics: [{ cosmetic: effect, grantedAt: new Date(), expiresAt: null, revokedAt: null }],
    };
    mocks.db.profileCosmetic.findMany.mockResolvedValue([effect]);
    mocks.db.user.findUnique.mockResolvedValue(member);
    expect((await getUserIdentity(member.id))?.effect?.id).toBe(effect.id);
    mocks.db.user.findUnique.mockResolvedValue({ ...member, id: 'other' });
    expect((await getUserIdentity('other'))?.effect).toBeNull();
  });
  it('hides exclusive frames and rejects forged grants or free flags for other accounts', async () => {
    const frame = { ...item(), id: 'frame-amira-rose', kind: 'FRAME', free: true };
    mocks.db.profileCosmetic.findMany.mockResolvedValue([frame]);
    mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === actor.id
        ? actor
        : {
            ...row(),
            profile: { appearance: { ...selection, frameId: frame.id } },
            cosmetics: [
              { cosmetic: frame, grantedAt: new Date(), expiresAt: null, revokedAt: null },
            ],
          },
    );
    expect((await getUserIdentity('subject'))?.frame).toBeNull();
    mocks.db.userBadge.findMany.mockResolvedValue([]);
    mocks.db.userCosmetic.findMany.mockResolvedValue([{ cosmeticId: frame.id }]);
    await expect(
      updateMyCommunityProfile({ appearance: { ...selection, frameId: frame.id } }),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });
  });
  it('does not let an administrator grant exclusive frames to another account or change their catalog definitions', async () => {
    mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === actor.id ? { ...actor, role: 'OWNER' } : row(),
    );
    mocks.db.profileCosmetic.findUnique.mockResolvedValue({
      ...item(),
      id: 'frame-amira-rose',
      kind: 'FRAME',
    });
    await expect(
      adminCommunityCommand({
        operation: 'grantCosmetic',
        accountNumber: 78,
        cosmeticId: 'frame-amira-rose',
      }),
    ).rejects.toMatchObject({ code: 'EXCLUSIVE_ITEM' });
    await expect(
      adminCommunityCommand({
        operation: 'saveCosmetic',
        id: 'frame-amira-rose',
        name: 'Changed',
        description: '',
        kind: 'FRAME',
        tier: 'royal',
        token: 'royal',
        free: true,
      }),
    ).rejects.toMatchObject({ code: 'EXCLUSIVE_ITEM' });
    expect(mocks.db.userCosmetic.upsert).not.toHaveBeenCalled();
    expect(mocks.db.profileCosmetic.upsert).not.toHaveBeenCalled();
  });
  it.each([
    [123456800, 2],
    [123456821, 78],
  ])('keeps retired profile %s attached to reserved ID %s', async (old, current) => {
    await getPublicProfile(old!);
    expect(mocks.db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountNumber: current } }),
    );
    await followProfile(old!, true);
    expect(mocks.updatePreferences).toHaveBeenCalledWith('actor', {
      type: 'follow',
      id: 'subject',
      enabled: true,
    });
    mocks.preferences.mockResolvedValue({ following: [], blockedUsers: [], privateProfile: true });
    expect(await getPublicProfile(old!)).toBeNull();
    await expect(getCommunityRaster('avatar', String(old))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountNumber: current } }),
    );
  });
  it('preserves canonical legacy privacy and social counts', async () => {
    mocks.preferences.mockImplementation(async (id) => ({
      following: id === 'actor' ? ['subject'] : [],
      blockedUsers: [],
      privateProfile: id === 'subject',
    }));
    expect(await getPublicProfile(123456789)).toBeNull();
    mocks.preferences.mockResolvedValue({
      following: ['subject'],
      blockedUsers: [],
      privateProfile: false,
    });
    mocks.socialCounts.mockResolvedValue({ followers: 7, following: 4 });
    const profile = await getPublicProfile(123456789);
    expect(profile?.followerCount).toBe(7);
    expect(profile?.followingCount).toBe(4);
    expect(profile?.isFollowing).toBe(true);
  });
  it('updates canonical privacy atomically without replacing existing follow relationships', async () => {
    await updateMyCommunityProfile({ visibility: 'PRIVATE' });
    expect(mocks.db.voicePreference.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: { following: ['preserved-peer'], privateProfile: true },
        }),
      }),
    );
    expect(mocks.db.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ visibility: 'PUBLIC' }) }),
    );
  });
  it('preserves legacy avatar bytes but rejects adopting another account avatar route', async () => {
    await expect(
      updateMyCommunityProfile({ avatarUrl: '/api/profile/avatar/other?v=example' }),
    ).rejects.toMatchObject({ code: 'AVATAR_NOT_OWNED' });
    mocks.session.mockResolvedValue(null);
    mocks.db.user.findUnique.mockResolvedValue({
      ...row(),
      profile: {
        visibility: 'PUBLIC',
        avatarContent: new Uint8Array([1, 2, 3]),
        avatarUrl: '/api/profile/avatar/subject?v=existing',
      },
    });
    const raster = await getCommunityRaster('avatar', '123456789');
    expect([...raster.bytes]).toEqual([1, 2, 3]);
    expect(raster.mime).toBe('image/webp');
    expect(raster.privateAsset).toBe(true);
  });
  it('refreshes multiple room identities using one catalog query', async () => {
    mocks.db.user.findMany.mockResolvedValue([
      { ...row(), id: 'first' },
      { ...row(), id: 'second' },
    ]);
    const result = await getUserIdentities(['first', 'second', 'first']);
    expect([...result.keys()]).toEqual(['first', 'second']);
    expect(mocks.db.user.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.db.profileCosmetic.findMany).toHaveBeenCalledTimes(1);
  });

  it('exposes only authorized equipped visuals when the collection is hidden', async () => {
    const pieces = [
      { ...item(), id: 'background-royal', kind: 'BACKGROUND' },
      { ...item(), id: 'name-card-gold', kind: 'NAME_CARD' },
      { ...item(), id: 'glow-gold', kind: 'GLOW' },
      { ...item(), id: 'hidden-unselected', kind: 'FRAME' },
    ];
    mocks.db.profileCosmetic.findMany.mockResolvedValue(pieces);
    mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === actor.id
        ? actor
        : {
            ...row(),
            profile: {
              showCollection: false,
              appearance: {
                ...selection,
                backgroundId: 'background-royal',
                nameCardId: 'name-card-gold',
                glowId: 'glow-gold',
              },
            },
            cosmetics: pieces.map((cosmetic) => ({
              cosmetic,
              grantedAt: new Date(),
              expiresAt: null,
              revokedAt: null,
            })),
          },
    );
    const profile = await getPublicProfile(123456789);
    expect(profile?.cosmetics).toEqual([]);
    expect(profile?.activeAppearance?.background?.id).toBe('background-royal');
    expect(profile?.activeAppearance?.nameCard?.id).toBe('name-card-gold');
    expect(profile?.activeAppearance?.glow?.id).toBe('glow-gold');
    expect(JSON.stringify(profile)).not.toContain('hidden-unselected');
  });
  it.each(['expired', 'revoked', 'unowned'])(
    'omits %s equipped profile visuals',
    async (condition) => {
      const cosmetic = { ...item(), id: 'background-royal', kind: 'BACKGROUND' };
      mocks.db.profileCosmetic.findMany.mockResolvedValue([cosmetic]);
      mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
        where.id === actor.id
          ? actor
          : {
              ...row(),
              profile: {
                showCollection: false,
                appearance: { ...selection, backgroundId: 'background-royal' },
              },
              cosmetics:
                condition === 'unowned'
                  ? []
                  : [
                      {
                        cosmetic,
                        expiresAt: condition === 'expired' ? new Date('2000-01-01') : null,
                        revokedAt: condition === 'revoked' ? new Date() : null,
                      },
                    ],
            },
      );
      const profile = await getPublicProfile(123456789);
      expect(profile?.activeAppearance?.background).toBeNull();
      expect(profile?.appearance.backgroundId).toBeNull();
      expect(profile?.cosmetics).toEqual([]);
    },
  );

  it('projects uploaded assets to compact references and bounds room badges', async () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
    const grants = Array.from({ length: 9 }, (_, index) => ({
      badge: { ...award(), id: `badge-${index}`, assetUrl: png },
      grantedAt: new Date(),
      expiresAt: null,
      revokedAt: null,
    }));
    mocks.db.user.findUnique.mockResolvedValue({
      ...row(),
      profile: {
        avatarUrl: png,
        updatedAt: new Date(),
        appearance: { ...selection, primaryBadgeId: 'badge-8' },
      },
      badges: grants,
    });
    const identity = await getUserIdentity('subject');
    expect(identity?.badges).toHaveLength(4);
    expect(identity?.badges[0].id).toBe('badge-8');
    expect(JSON.stringify(identity)).not.toContain('base64');
    expect(identity?.avatarUrl).toContain('/api/community/assets/avatar/123456789');
  });
  it('hides private uploaded assets from outsiders and never shares private covers', async () => {
    mocks.session.mockResolvedValue(null);
    mocks.db.user.findUnique.mockResolvedValue({
      ...row(),
      tokenVersion: 3,
      profile: {
        visibility: 'PRIVATE',
        avatarUrl: 'data:image/png;base64,AAAA',
        coverUrl: 'data:image/png;base64,AAAA',
      },
    });
    await expect(getCommunityRaster('avatar', '123456789')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    mocks.session.mockResolvedValue({ user: { id: 'actor', tokenVersion: 3 } });
    mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === 'actor'
        ? actor
        : {
            ...row(),
            tokenVersion: 3,
            profile: { visibility: 'PRIVATE', coverUrl: 'data:image/png;base64,AAAA' },
          },
    );
    await expect(getCommunityRaster('cover', '123456789')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.db.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires stored identity instead of claimed role', async () => {
    await expect(adminCommunityCommand({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    mocks.db.user.findUnique.mockResolvedValue({ ...actor, tokenVersion: 4 });
    await expect(getMyCommunityProfile()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(mocks.db.profile.upsert).not.toHaveBeenCalled();
  });
  it('cannot reveal private profiles with caller-supplied viewer ID', async () => {
    mocks.session.mockResolvedValue(null);
    mocks.db.user.findUnique.mockResolvedValue({ ...row(), profile: { visibility: 'PRIVATE' } });
    expect(await getPublicProfile(123456789, 'subject')).toBeNull();
  });
  it('serializes an allowlist without secrets', async () => {
    mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === actor.id
        ? actor
        : { ...row(), email: 'private@test', passwordHash: 'secret', tokenVersion: 20 },
    );
    const profile = await getPublicProfile(123456789);
    expect(profile?.name).toBe('Subject');
    for (const key of ['email', 'passwordHash', 'tokenVersion', 'role'])
      expect(profile).not.toHaveProperty(key);
  });
  it('does not equip unowned cosmetics', async () => {
    mocks.db.profileCosmetic.findMany.mockResolvedValue([item()]);
    await expect(
      updateMyCommunityProfile({ appearance: { ...selection, effectId: 'entrance-gold' } }),
    ).rejects.toMatchObject({ code: 'ITEM_NOT_OWNED' });
    expect(mocks.db.profile.upsert).not.toHaveBeenCalled();
  });
  it('preserves existing name when first saving appearance only', async () => {
    await updateMyCommunityProfile({ entranceEnabled: false });
    expect(mocks.db.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ displayName: actor.name, entranceEnabled: false }),
      }),
    );
  });
  it('removes expired badge-linked effects from live identity', async () => {
    mocks.db.profileCosmetic.findMany.mockResolvedValue([item()]);
    mocks.db.user.findUnique.mockResolvedValue({
      ...row(),
      profile: {
        appearance: { ...selection, effectId: 'entrance-gold', primaryBadgeId: 'gold-member' },
      },
      badges: [
        {
          badge: award(),
          grantedAt: new Date(),
          expiresAt: new Date('2000-01-01'),
          revokedAt: null,
        },
      ],
    });
    const identity = await getUserIdentity('subject');
    expect(identity?.effect).toBeNull();
    expect(identity?.badges).toEqual([]);
    expect(identity?.primaryBadge).toBeNull();
  });
  it('active badge unlocks only its linked cosmetic', async () => {
    mocks.db.profileCosmetic.findMany.mockResolvedValue([item()]);
    mocks.db.user.findUnique.mockResolvedValue({
      ...row(),
      profile: { appearance: { ...selection, effectId: 'entrance-gold' } },
      badges: [{ badge: award(), grantedAt: new Date(), expiresAt: null, revokedAt: null }],
    });
    expect((await getUserIdentity('subject'))?.effect?.id).toBe('entrance-gold');
  });
  it('can unfollow a target after they become private', async () => {
    mocks.db.user.findUnique.mockImplementation(async ({ where }) =>
      where.id === actor.id ? actor : { ...row(), profile: { visibility: 'PRIVATE' } },
    );
    expect(await followProfile(123456789, false)).toBeNull();
    expect(mocks.updatePreferences).toHaveBeenCalledWith(actor.id, {
      type: 'follow',
      id: 'subject',
      enabled: false,
    });
    await expect(followProfile(123456789, true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.updatePreferences).not.toHaveBeenCalledWith(actor.id, {
      type: 'follow',
      id: 'subject',
      enabled: true,
    });
  });
  it('uses the existing voice follow graph', async () => {
    await followProfile(123456789, true);
    expect(mocks.updatePreferences).toHaveBeenCalledWith('actor', {
      type: 'follow',
      id: 'subject',
      enabled: true,
    });
  });
  it('ADMIN cannot create or grant protected badges', async () => {
    mocks.db.user.findUnique.mockResolvedValue({ ...actor, role: 'ADMIN' });
    mocks.db.communityBadge.findUnique.mockResolvedValue(null);
    await expect(
      adminCommunityCommand({
        operation: 'saveBadge',
        id: 'fake-manager',
        name: 'مشرف المنصة',
        description: '',
        category: 'COMMUNITY',
        rarity: 'common',
        sensitive: false,
      }),
    ).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    mocks.db.communityBadge.findUnique.mockResolvedValue({
      ...award(),
      category: 'ADMIN',
      sensitive: false,
    });
    await expect(
      adminCommunityCommand({
        operation: 'grantBadge',
        accountNumber: 123456789,
        badgeId: 'gold-member',
      }),
    ).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
    expect(mocks.db.userBadge.upsert).not.toHaveBeenCalled();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
  });
});
