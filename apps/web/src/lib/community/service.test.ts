import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminCommunityCommand,
  followProfile,
  getCommunityRaster,
  getMyCommunityProfile,
  getPublicProfile,
  getUserIdentity,
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
    db: {
      user: model(),
      profile: model(),
      userBadge: model(),
      userCosmetic: model(),
      profileCosmetic: model(),
      communityBadge: model(),
      userFollow: model(),
      voiceRoom: model(),
      auditLog: model(),
      $transaction: vi.fn(),
      $queryRaw: vi.fn(),
    },
  };
});
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
  mocks.db.userFollow.count.mockResolvedValue(0);
  mocks.db.userFollow.findUnique.mockResolvedValue(null);
});
describe('community server authority', () => {
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
    expect(mocks.db.userFollow.deleteMany).toHaveBeenCalledWith({
      where: { followerId: actor.id, targetId: 'subject' },
    });
    await expect(followProfile(123456789, true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.db.userFollow.createMany).not.toHaveBeenCalled();
  });
  it('uses idempotent follow relation creation', async () => {
    await followProfile(123456789, true);
    expect(mocks.db.userFollow.createMany).toHaveBeenCalledWith({
      data: [{ followerId: 'actor', targetId: 'subject' }],
      skipDuplicates: true,
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
