import 'server-only';
import { canonicalAccountNumber, PUBLIC_ACCOUNT_NUMBER_PATTERN } from '@/lib/account-number';
import { Prisma } from '@tahaddi/database';
import { getDisplayPlanCode } from '@/lib/subscription/entitlements';
import { planDefinition } from '@tahaddi/domain';
import { getVoicePreferences, updateVoicePreferences } from '@/lib/voice/repository';
import { profileSocialCounts } from '@/lib/profile/repository';
import { VoiceHttpError } from '@/lib/voice/http';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import { isSessionUserCurrent } from '@/lib/auth/session-user';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isExclusiveCosmetic, mayUseExclusiveCosmetic } from './exclusive-cosmetics';
import {
  adminCommandSchema,
  appearanceSchema,
  isSensitiveBadge,
  profilePatchSchema,
} from './validation';
import type {
  AdminCommunityData,
  AppearanceSelection,
  CommunityBadge,
  CommunityCosmetic,
  CosmeticKind,
  EntranceTier,
  MyCommunityProfile,
  PublicIdentity,
  PublicProfile,
  ProfileVisibility,
} from './contracts';

export class CommunityError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
const emptyAppearance: AppearanceSelection = {
  frameId: null,
  effectId: null,
  primaryBadgeId: null,
  nameCardId: null,
  backgroundId: null,
  glowId: null,
};
const identitySelect = {
  id: true,
  accountNumber: true,
  name: true,
  image: true,
  status: true,
  role: true,
  createdAt: true,
  profile: true,
  badges: { include: { badge: true } },
  cosmetics: { include: { cosmetic: true } },
} satisfies Prisma.UserSelect;
type IdentityRow = Prisma.UserGetPayload<{ select: typeof identitySelect }>;
type CosmeticRow = Prisma.ProfileCosmeticGetPayload<Record<string, never>>;
type BadgeRow = Prisma.CommunityBadgeGetPayload<Record<string, never>>;
function assetReference(
  value: string | null,
  kind: string,
  id: string,
  version: Date | string | undefined,
): string | null {
  return value?.startsWith('data:')
    ? `/api/community/assets/${kind}/${encodeURIComponent(id)}?v=${version instanceof Date ? version.getTime() : (version ?? 1)}`
    : value;
}
function cosmetic(row: CosmeticRow): CommunityCosmetic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind as CosmeticKind,
    tier: row.tier as EntranceTier,
    token: row.token,
    assetUrl: assetReference(row.assetUrl, 'cosmetic', row.id, row.updatedAt),
    archived: row.archived,
    free: row.free,
  };
}
function badge(row: BadgeRow): CommunityBadge {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    rarity: row.rarity,
    assetUrl: assetReference(row.assetUrl, 'badge', row.id, row.updatedAt),
    sensitive: row.sensitive,
    archived: row.archived,
    effectId: row.effectId,
    frameId: row.frameId,
  };
}
function active(grant: { revokedAt: Date | null; expiresAt: Date | null }, now: Date) {
  return !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now);
}
async function viewer() {
  const session = await getCurrentSession();
  if (!session?.user?.id) return null;
  const row = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  return isSessionUserCurrent(session.user, row) ? row : null;
}
export async function requireCommunityActor(admin = false) {
  const actor = await viewer();
  if (!actor) throw new CommunityError('UNAUTHENTICATED', 401);
  if (admin && actor.role !== 'ADMIN' && actor.role !== 'OWNER')
    throw new CommunityError('FORBIDDEN', 403);
  return actor;
}
async function rate(scope: string, id: string, limit = 30) {
  if (!(await checkRateLimit(`community-${scope}:${id}`, limit, 60000)))
    throw new CommunityError('RATE_LIMITED', 429);
}
type CommunityReader = Pick<Prisma.TransactionClient, 'user' | 'profileCosmetic'>;
async function resolve(
  row: IdentityRow,
  db: CommunityReader = getPrismaClient(),
  prefetchedCatalog?: CommunityCosmetic[],
) {
  const now = new Date();
  const badges = row.badges
    .filter((g) => active(g, now) && !g.badge.archived)
    .map((g) => ({
      ...badge(g.badge),
      grantedAt: g.grantedAt.toISOString(),
      expiresAt: g.expiresAt?.toISOString() ?? null,
    }));
  const owned = row.cosmetics
    .filter((g) => active(g, now) && !g.cosmetic.archived)
    .map((g) => ({ ...cosmetic(g.cosmetic), expiresAt: g.expiresAt?.toISOString() ?? null }));
  const catalog = (
    prefetchedCatalog ??
    (
      await db.profileCosmetic.findMany({
        where: { archived: false },
        orderBy: { createdAt: 'asc' },
      })
    ).map(cosmetic)
  ).filter((c) => mayUseExclusiveCosmetic(c.id, row.id, row.role));
  const unlocked = new Set(owned.map((item) => item.id));
  for (const b of badges) {
    if (b.frameId) unlocked.add(b.frameId);
    if (b.effectId) unlocked.add(b.effectId);
  }
  const available = catalog.filter((c) => c.free || unlocked.has(c.id));
  const selected = appearanceSchema.safeParse(row.profile?.appearance);
  const appearance = selected.success ? selected.data : { ...emptyAppearance };
  const get = (id: string | null, kind: CosmeticKind) =>
    available.find((c) => c.id === id && c.kind === kind) ?? null;
  const primaryBadge = badges.find((b) => b.id === appearance.primaryBadgeId) ?? null;
  for (const [key, kind] of Object.entries({
    frameId: 'FRAME',
    effectId: 'EFFECT',
    nameCardId: 'NAME_CARD',
    backgroundId: 'BACKGROUND',
    glowId: 'GLOW',
  })) {
    if (!get(appearance[key as keyof AppearanceSelection], kind as CosmeticKind))
      appearance[key as keyof AppearanceSelection] = null;
  }
  if (!primaryBadge) appearance.primaryBadgeId = null;
  return {
    badges,
    owned: available,
    catalog,
    appearance,
    primaryBadge,
    frame: get(appearance.frameId, 'FRAME'),
    effect: get(appearance.effectId, 'EFFECT'),
    activeAppearance: {
      background: get(appearance.backgroundId, 'BACKGROUND'),
      nameCard: get(appearance.nameCardId, 'NAME_CARD'),
      glow: get(appearance.glowId, 'GLOW'),
    },
  };
}
function identity(row: IdentityRow, state: Awaited<ReturnType<typeof resolve>>): PublicIdentity {
  return {
    userId: row.id,
    accountNumber: row.accountNumber,
    name: row.profile?.displayName || row.name || 'عضو تحدّي',
    username: row.profile?.username ?? null,
    avatarUrl: assetReference(
      row.profile?.avatarContent && row.profile.avatarUrl?.startsWith('/api/profile/avatar/')
        ? 'data:legacy-avatar'
        : row.profile?.avatarUrl || row.image || null,
      'avatar',
      String(row.accountNumber),
      row.profile?.updatedAt,
    ),
    badges: state.badges,
    frame: state.frame,
    effect: state.effect,
    primaryBadge: state.primaryBadge,
  };
}
export async function getUserIdentity(
  userId: string,
  db: CommunityReader = getPrismaClient(),
): Promise<PublicIdentity | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: identitySelect });
  if (!row || row.status !== 'ACTIVE') return null;
  const result = identity(row, await resolve(row, db));
  // Compact room cards carry a primary badge plus at most three additional awards.
  result.badges = [
    ...(result.primaryBadge ? [result.primaryBadge] : []),
    ...result.badges.filter((b) => b.id !== result.primaryBadge?.id),
  ].slice(0, 4);
  return result;
}
/** Bulk counterpart for LiveKit room/profile refreshes; one catalog read, no per-member queries. */
export async function getUserIdentities(
  userIds: readonly string[],
  db: CommunityReader = getPrismaClient(),
): Promise<Map<string, PublicIdentity>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const [rows, cosmetics] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: identitySelect,
    }),
    db.profileCosmetic.findMany({ where: { archived: false }, orderBy: { createdAt: 'asc' } }),
  ]);
  const catalog = cosmetics.map(cosmetic);
  const result = new Map<string, PublicIdentity>();
  for (const row of rows) {
    const entry = identity(row, await resolve(row, db, catalog));
    entry.badges = [
      ...(entry.primaryBadge ? [entry.primaryBadge] : []),
      ...entry.badges.filter((b) => b.id !== entry.primaryBadge?.id),
    ].slice(0, 4);
    result.set(row.id, entry);
  }
  return result;
}
async function profileFor(row: IdentityRow, viewerId: string | null): Promise<PublicProfile> {
  const db = getPrismaClient();
  const state = await resolve(row);
  const self = viewerId === row.id;
  const [counts, targetPreferences, viewerPreferences, rooms] = await Promise.all([
    profileSocialCounts(row.id),
    getVoicePreferences(row.id),
    viewerId ? getVoicePreferences(viewerId) : null,
    self || row.profile?.showRooms !== false
      ? db.$queryRaw<{ id: string; name: string; code: string; role: string; system: string }[]>`
        SELECT r.id,COALESCE(r.state->'settings'->>'name','غرفة صوتية') AS name,r.id AS code,
          CASE WHEN r."hostId"=${row.id} THEN 'OWNER' ELSE 'MODERATOR' END AS role,'live' AS system,r."createdAt"
        FROM "VoiceRoom" r WHERE r.active=true
          AND (r."hostId"=${row.id} OR EXISTS (SELECT 1 FROM jsonb_array_elements(r.state->'participants') m
            WHERE m->>'id'=${row.id} AND m->>'role'='moderator' AND (m->>'lastSeenAt')::numeric > extract(epoch FROM clock_timestamp())*1000-90000))
          AND (r."isPrivate"=false OR ${self} OR EXISTS(SELECT 1 FROM jsonb_array_elements(r.state->'participants') m
            WHERE m->>'id'=${viewerId ?? ''} AND (m->>'lastSeenAt')::numeric > extract(epoch FROM clock_timestamp())*1000-90000))
        UNION ALL
        SELECT r.id,r.name,r.code,CASE WHEN r."ownerId"=${row.id} THEN 'OWNER' ELSE 'MODERATOR' END AS role,'community' AS system,r."createdAt"
        FROM "CommunityVoiceRoom" r WHERE r.status='OPEN' AND (r."ownerId"=${row.id} OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(r.state->'members') m WHERE m->'identity'->>'userId'=${row.id}
            AND m->>'role'='MODERATOR' AND (m->>'lastSeenAt')::numeric > extract(epoch FROM clock_timestamp())*1000-45000
        )) ORDER BY "createdAt" DESC LIMIT 20`
      : [],
  ]);
  const xp = row.profile?.xp ?? 0;
  const planCode = await getDisplayPlanCode(db, row.id, row.role);
  return {
    ...identity(row, state),
    bio: row.profile?.bio ?? null,
    coverUrl: assetReference(
      row.profile?.coverUrl ?? null,
      'cover',
      String(row.accountNumber),
      row.profile?.updatedAt,
    ),
    joinedAt: row.createdAt.toISOString(),
    visibility: (targetPreferences.privateProfile
      ? 'PRIVATE'
      : (row.profile?.visibility ?? 'PUBLIC')) as ProfileVisibility,
    rank: { code: planCode, name: planDefinition(planCode).name },
    level: Math.floor(xp / 100) + 1,
    xp,
    followerCount: counts.followers,
    followingCount: counts.following,
    isFollowing: Boolean(viewerPreferences?.following.includes(row.id)),
    isSelf: self,
    cosmetics: self || row.profile?.showCollection !== false ? state.owned : [],
    achievements: state.badges.filter((b) => b.category === 'ACHIEVEMENT'),
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      roomNumber: room.system === 'community' ? Number(room.code) : room.code,
      href: `/${room.system === 'community' ? 'community-voice' : 'voice'}/${encodeURIComponent(room.id)}`,
      role: room.role,
    })),
    appearance: state.appearance,
    activeAppearance: state.activeAppearance,
    showRooms: row.profile?.showRooms ?? true,
    showCollection: row.profile?.showCollection ?? true,
  };
}
export async function getPublicProfile(
  accountNumber: number,
  _viewerId?: string,
): Promise<PublicProfile | null> {
  // A caller-supplied ID is never an authorization credential.
  void _viewerId;
  accountNumber = canonicalAccountNumber(accountNumber);
  const actor = await viewer();
  const row = await getPrismaClient().user.findUnique({
    where: { accountNumber },
    select: identitySelect,
  });
  if (!row || row.status !== 'ACTIVE') return null;
  const self = actor?.id === row.id;
  const targetPreferences = await getVoicePreferences(row.id);
  const actorPreferences = actor ? await getVoicePreferences(actor.id) : null;
  if (
    !self &&
    (targetPreferences.blockedUsers.includes(actor?.id ?? '') ||
      actorPreferences?.blockedUsers.includes(row.id))
  )
    return null;
  const visibility = targetPreferences.privateProfile
    ? 'PRIVATE'
    : (row.profile?.visibility ?? 'PUBLIC');
  if (!self && (visibility === 'PRIVATE' || (visibility === 'MEMBERS' && !actor))) return null;
  return profileFor(row, actor?.id ?? null);
}
export async function getMyCommunityProfile(): Promise<MyCommunityProfile> {
  const actor = await requireCommunityActor();
  const row = await getPrismaClient().user.findUniqueOrThrow({
    where: { id: actor.id },
    select: identitySelect,
  });
  const state = await resolve(row);
  return {
    profile: {
      ...(await profileFor(row, actor.id)),
      avatarUrl: row.profile?.avatarUrl || row.image || null,
      coverUrl: row.profile?.coverUrl ?? null,
    },
    catalog: state.catalog,
    ownedCosmetics: state.owned,
    settings: {
      entranceEnabled: row.profile?.entranceEnabled ?? true,
      entranceSound: row.profile?.entranceSound ?? false,
      reduceEffects: row.profile?.reduceEffects ?? false,
    },
  };
}
export async function updateMyCommunityProfile(input: unknown) {
  const actor = await requireCommunityActor();
  await rate('settings', actor.id, 15);
  const parsed = profilePatchSchema.safeParse(input);
  if (!parsed.success) throw new CommunityError('INVALID_PROFILE');
  const data = parsed.data;
  if (
    data.avatarUrl?.startsWith('/api/profile/avatar/') &&
    new URL(data.avatarUrl, 'https://local.invalid').pathname !==
      `/api/profile/avatar/${encodeURIComponent(actor.id)}`
  )
    throw new CommunityError('AVATAR_NOT_OWNED', 403);
  const db = getPrismaClient();
  await db.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({
      where: { id: actor.id },
      select: { id: true, role: true, status: true, tokenVersion: true, name: true },
    });
    if (!fresh || fresh.status !== 'ACTIVE' || fresh.tokenVersion !== actor.tokenVersion)
      throw new CommunityError('SESSION_REVOKED', 401);
    if (data.appearance) {
      // Resolve grants in this transaction so expired or revoked items cannot be equipped.
      const now = new Date();
      const grants = await tx.userBadge.findMany({
        where: {
          userId: actor.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          badge: { archived: false },
        },
        include: { badge: true },
      });
      const owned = await tx.userCosmetic.findMany({
        where: {
          userId: actor.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          cosmetic: { archived: false },
        },
      });
      const unlocked = new Set(owned.map((g) => g.cosmeticId));
      for (const g of grants) {
        if (g.badge.frameId) unlocked.add(g.badge.frameId);
        if (g.badge.effectId) unlocked.add(g.badge.effectId);
      }
      const catalog = await tx.profileCosmetic.findMany({ where: { archived: false } });
      const keys = {
        frameId: 'FRAME',
        effectId: 'EFFECT',
        nameCardId: 'NAME_CARD',
        backgroundId: 'BACKGROUND',
        glowId: 'GLOW',
      } as const;
      for (const [key, kind] of Object.entries(keys)) {
        const id = data.appearance[key as keyof typeof keys];
        if (
          id &&
          !catalog.some(
            (c) =>
              c.id === id &&
              c.kind === kind &&
              (c.free || unlocked.has(c.id)) &&
              mayUseExclusiveCosmetic(c.id, fresh.id, fresh.role),
          )
        )
          throw new CommunityError('ITEM_NOT_OWNED', 403);
      }
      if (
        data.appearance.primaryBadgeId &&
        !grants.some((g) => g.badgeId === data.appearance!.primaryBadgeId)
      )
        throw new CommunityError('BADGE_NOT_OWNED', 403);
    }
    const { appearance, ...fields } = data;
    if (data.visibility !== undefined) {
      const preferences = await tx.voicePreference.upsert({
        where: { userId: actor.id },
        create: { userId: actor.id, state: { privateProfile: data.visibility === 'PRIVATE' } },
        update: {},
      });
      const updated = await tx.voicePreference.updateMany({
        where: { userId: actor.id, revision: preferences.revision },
        data: {
          state: {
            ...(preferences.state as Prisma.JsonObject),
            privateProfile: data.visibility === 'PRIVATE',
          },
          revision: { increment: 1 },
        },
      });
      if (!updated.count) throw new CommunityError('CONFLICT', 409);
      // Reuse the existing voice privacy flag so legacy privacy controls remain authoritative.
      fields.visibility = data.visibility === 'PRIVATE' ? 'PUBLIC' : data.visibility;
    }
    if (data.displayName !== undefined)
      await tx.user.updateMany({
        where: { id: actor.id, status: 'ACTIVE', tokenVersion: actor.tokenVersion },
        data: { name: data.displayName },
      });
    await tx.profile.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        displayName: data.displayName ?? fresh.name ?? 'عضو تحدّي',
        ...fields,
        ...(appearance ? { appearance } : {}),
      },
      update: { ...fields, ...(appearance ? { appearance } : {}) },
    });
  });
  return getMyCommunityProfile();
}
export async function followProfile(accountNumber: number, follow: boolean) {
  accountNumber = canonicalAccountNumber(accountNumber);
  const actor = await requireCommunityActor();
  await rate('follow', actor.id);
  const target = await getPrismaClient().user.findUnique({
    where: { accountNumber },
    select: { id: true, status: true },
  });
  if (!target) throw new CommunityError('NOT_FOUND', 404);
  if (target.id === actor.id) throw new CommunityError('SELF_FOLLOW');
  if (follow && !(await getPublicProfile(accountNumber)))
    throw new CommunityError('NOT_FOUND', 404);
  try {
    await updateVoicePreferences(actor.id, { type: 'follow', id: target.id, enabled: follow });
  } catch (error) {
    if (error instanceof VoiceHttpError) throw new CommunityError(error.code, error.status);
    throw error;
  }
  return getPublicProfile(accountNumber);
}
export async function getAdminCommunityData(): Promise<AdminCommunityData> {
  await requireCommunityActor(true);
  const db = getPrismaClient();
  const [badges, cosmetics, grants, audit] = await Promise.all([
    db.communityBadge.findMany({ orderBy: { createdAt: 'desc' } }),
    db.profileCosmetic.findMany({ orderBy: { createdAt: 'asc' } }),
    db.userBadge.findMany({
      take: 100,
      orderBy: { grantedAt: 'desc' },
      include: { badge: true, user: { select: { id: true, name: true, accountNumber: true } } },
    }),
    db.auditLog.findMany({
      where: { resourceType: 'COMMUNITY' },
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, createdAt: true, resourceId: true, targetUserId: true },
    }),
  ]);
  return {
    badges: badges.map(badge),
    cosmetics: cosmetics.map(cosmetic),
    grants: grants.map((g) => ({
      id: g.id,
      userId: g.userId,
      accountNumber: g.user.accountNumber,
      name: g.user.name ?? 'عضو',
      badge: badge(g.badge),
      grantedAt: g.grantedAt.toISOString(),
      expiresAt: g.expiresAt?.toISOString() ?? null,
      revokedAt: g.revokedAt?.toISOString() ?? null,
    })),
    audit: audit.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  };
}
export async function adminCommunityCommand(input: unknown) {
  const actor = await requireCommunityActor(true);
  await rate('admin', actor.id, 30);
  const parsed = adminCommandSchema.safeParse(input);
  if (!parsed.success) throw new CommunityError('INVALID_COMMAND');
  const command = parsed.data;
  const db = getPrismaClient();
  await db.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({
      where: { id: actor.id },
      select: { role: true, status: true, tokenVersion: true },
    });
    if (
      !fresh ||
      fresh.status !== 'ACTIVE' ||
      fresh.tokenVersion !== actor.tokenVersion ||
      !['OWNER', 'ADMIN'].includes(fresh.role)
    )
      throw new CommunityError('SESSION_REVOKED', 401);
    let resourceId: string;
    let targetUserId: string | undefined;
    if (command.operation === 'saveBadge') {
      const { operation, ...data } = command;
      void operation;
      const previous = await tx.communityBadge.findUnique({ where: { id: data.id } });
      if (data.assetUrl?.startsWith('/api/community/assets/')) {
        if (
          !previous ||
          data.assetUrl !==
            assetReference(previous.assetUrl, 'badge', previous.id, previous.updatedAt)
        )
          throw new CommunityError('INVALID_ASSET');
        data.assetUrl = previous.assetUrl;
      }
      if (
        (isSensitiveBadge(data) || (previous && isSensitiveBadge(previous))) &&
        fresh.role !== 'OWNER'
      )
        throw new CommunityError('OWNER_REQUIRED', 403);
      for (const [id, kind] of [
        [data.effectId, 'EFFECT'],
        [data.frameId, 'FRAME'],
      ] as const)
        if (id && !(await tx.profileCosmetic.findFirst({ where: { id, kind, archived: false } })))
          throw new CommunityError('INVALID_LINKED_ITEM');
      await tx.communityBadge.upsert({ where: { id: data.id }, create: data, update: data });
      resourceId = data.id;
    } else if (command.operation === 'saveCosmetic') {
      const { operation, ...data } = command;
      void operation;
      if (isExclusiveCosmetic(data.id)) throw new CommunityError('EXCLUSIVE_ITEM', 403);
      if (data.assetUrl?.startsWith('/api/community/assets/')) {
        const previous = await tx.profileCosmetic.findUnique({ where: { id: data.id } });
        if (
          !previous ||
          data.assetUrl !==
            assetReference(previous.assetUrl, 'cosmetic', previous.id, previous.updatedAt)
        )
          throw new CommunityError('INVALID_ASSET');
        data.assetUrl = previous.assetUrl;
      }
      await tx.profileCosmetic.upsert({ where: { id: data.id }, create: data, update: data });
      resourceId = data.id;
    } else {
      const user = await tx.user.findUnique({
        where: { accountNumber: command.accountNumber },
        select: { id: true, status: true, role: true },
      });
      if (!user || user.status !== 'ACTIVE') throw new CommunityError('NOT_FOUND', 404);
      targetUserId = user.id;
      const expiresAt = command.expiresAt ? new Date(command.expiresAt) : null;
      if (command.operation.endsWith('Badge')) {
        const item = await tx.communityBadge.findUnique({ where: { id: command.badgeId! } });
        if (!item) throw new CommunityError('NOT_FOUND', 404);
        if (isSensitiveBadge(item) && fresh.role !== 'OWNER')
          throw new CommunityError('OWNER_REQUIRED', 403);
        resourceId = item.id;
        if (command.operation === 'grantBadge') {
          if (item.archived) throw new CommunityError('ARCHIVED_ITEM');
          await tx.userBadge.upsert({
            where: { userId_badgeId: { userId: user.id, badgeId: item.id } },
            create: { userId: user.id, badgeId: item.id, grantedBy: actor.id, expiresAt },
            update: { grantedBy: actor.id, grantedAt: new Date(), expiresAt, revokedAt: null },
          });
        } else
          await tx.userBadge.updateMany({
            where: { userId: user.id, badgeId: item.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
      } else {
        const item = await tx.profileCosmetic.findUnique({ where: { id: command.cosmeticId! } });
        if (!item) throw new CommunityError('NOT_FOUND', 404);
        resourceId = item.id;
        if (command.operation === 'grantCosmetic') {
          if (!mayUseExclusiveCosmetic(item.id, user.id, user.role))
            throw new CommunityError('EXCLUSIVE_ITEM', 403);
          if (item.archived) throw new CommunityError('ARCHIVED_ITEM');
          await tx.userCosmetic.upsert({
            where: { userId_cosmeticId: { userId: user.id, cosmeticId: item.id } },
            create: { userId: user.id, cosmeticId: item.id, grantedBy: actor.id, expiresAt },
            update: { grantedBy: actor.id, grantedAt: new Date(), expiresAt, revokedAt: null },
          });
        } else
          await tx.userCosmetic.updateMany({
            where: { userId: user.id, cosmeticId: item.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
      }
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorRole: fresh.role,
        action: `community.${command.operation}`,
        resourceType: 'COMMUNITY',
        resourceId,
        targetUserId,
        result: 'SUCCESS',
      },
    });
  });
  return getAdminCommunityData();
}

/** Serve stored raster bytes separately so realtime snapshots never repeat base64 assets. */
export async function getCommunityRaster(kind: string, id: string) {
  const db = getPrismaClient();
  let value: string | null = null;
  let privateAsset = false;
  let legacyBytes: Uint8Array | null = null;
  if (kind === 'badge')
    value =
      (
        await db.communityBadge.findFirst({
          where: { id, archived: false },
          select: { assetUrl: true },
        })
      )?.assetUrl ?? null;
  else if (kind === 'cosmetic')
    value =
      (
        await db.profileCosmetic.findFirst({
          where: { id, archived: false },
          select: { assetUrl: true },
        })
      )?.assetUrl ?? null;
  else if (kind === 'avatar' || kind === 'cover') {
    if (!PUBLIC_ACCOUNT_NUMBER_PATTERN.test(id)) throw new CommunityError('NOT_FOUND', 404);
    id = String(canonicalAccountNumber(Number(id)));
    const row = await db.user.findUnique({
      where: { accountNumber: Number(id) },
      select: {
        id: true,
        status: true,
        tokenVersion: true,
        image: true,
        profile: {
          select: { visibility: true, avatarUrl: true, coverUrl: true, avatarContent: true },
        },
      },
    });
    if (!row || row.status !== 'ACTIVE') throw new CommunityError('NOT_FOUND', 404);
    const actor = await viewer();
    const targetPreferences = await getVoicePreferences(row.id);
    const actorPreferences = actor ? await getVoicePreferences(actor.id) : null;
    if (
      actor?.id !== row.id &&
      (targetPreferences.blockedUsers.includes(actor?.id ?? '') ||
        actorPreferences?.blockedUsers.includes(row.id))
    )
      throw new CommunityError('NOT_FOUND', 404);
    const visibility = targetPreferences.privateProfile
      ? 'PRIVATE'
      : (row.profile?.visibility ?? 'PUBLIC');
    if (actor?.id !== row.id && visibility !== 'PUBLIC') {
      if (!actor) throw new CommunityError('NOT_FOUND', 404);
      if (visibility === 'PRIVATE') {
        if (kind === 'cover') throw new CommunityError('NOT_FOUND', 404);
        const shared = await db.$queryRaw<
          { allowed: number }[]
        >`SELECT 1 AS allowed FROM "CommunityVoiceRoom" r WHERE r.status='OPEN'
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.state->'members') m WHERE m->'identity'->>'userId'=${actor.id} AND (m->>'lastSeenAt')::numeric > extract(epoch FROM clock_timestamp())*1000-45000 AND (m->>'tokenVersion')::int=${actor.tokenVersion})
          AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.state->'members') m WHERE m->'identity'->>'userId'=${row.id} AND (m->>'lastSeenAt')::numeric > extract(epoch FROM clock_timestamp())*1000-45000 AND (m->>'tokenVersion')::int=${row.tokenVersion}) LIMIT 1`;
        if (!shared.length) {
          const liveShared = await db.$queryRaw<
            { allowed: number }[]
          >`SELECT 1 AS allowed FROM "VoiceRoom" r WHERE r.active=true
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.state->'participants') m WHERE m->>'id'=${actor.id} AND (m->>'lastSeenAt')::numeric>extract(epoch FROM clock_timestamp())*1000-90000 AND COALESCE((m->>'tokenVersion')::int,0)=${actor.tokenVersion})
            AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.state->'participants') m WHERE m->>'id'=${row.id} AND (m->>'lastSeenAt')::numeric>extract(epoch FROM clock_timestamp())*1000-90000 AND COALESCE((m->>'tokenVersion')::int,0)=${row.tokenVersion}) LIMIT 1`;
          if (!liveShared.length) throw new CommunityError('NOT_FOUND', 404);
        }
      }
    }
    value =
      kind === 'cover'
        ? (row.profile?.coverUrl ?? null)
        : row.profile?.avatarUrl || row.image || null;
    privateAsset = true;
    if (
      kind === 'avatar' &&
      row.profile?.avatarContent &&
      row.profile.avatarUrl?.startsWith('/api/profile/avatar/')
    )
      legacyBytes = new Uint8Array(row.profile.avatarContent);
  } else throw new CommunityError('NOT_FOUND', 404);
  if (legacyBytes)
    return { bytes: Buffer.from(legacyBytes), mime: 'image/webp', privateAsset: true };
  if (!value?.startsWith('data:')) throw new CommunityError('NOT_FOUND', 404);
  const match = /^data:(image\/(?:png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new CommunityError('NOT_FOUND', 404);
  return { bytes: Buffer.from(match[2]!, 'base64'), mime: match[1]!, privateAsset };
}
