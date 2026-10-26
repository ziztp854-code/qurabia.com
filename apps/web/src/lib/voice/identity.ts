import { voiceAccountBadges, voiceBadgeAccountSelect } from './account-badges';
import 'server-only';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { VoiceHttpError } from './http';
import type { VoiceIdentity } from './types';
import { voiceCommunityIdentities } from './community-identity';
/** Event authorization does not need profile decorations or the cosmetic catalog. */
export async function voiceActor(): Promise<{ id: string }> {
  const session = await getCurrentSession();
  if (!session?.user?.id)
    throw new VoiceHttpError(401, 'سجّل الدخول للانضمام إلى تحدي لايف.', 'AUTH_REQUIRED');
  const user = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(session.user, user))
    throw new VoiceHttpError(401, 'انتهت صلاحية الجلسة. سجّل الدخول مجددًا.', 'SESSION_REVOKED');
  return { id: user.id };
}

export async function voiceIdentity(): Promise<VoiceIdentity> {
  const session = await getCurrentSession();
  if (!session?.user?.id)
    throw new VoiceHttpError(401, 'سجّل الدخول للانضمام إلى تحدي لايف.', 'AUTH_REQUIRED');
  const user = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      accountNumber: true,
      name: true,
      image: true,
      ...voiceBadgeAccountSelect,
      status: true,
      tokenVersion: true,
      profile: { select: { displayName: true, avatarUrl: true } },
    },
  });
  if (!isSessionUserCurrent(session.user, user))
    throw new VoiceHttpError(401, 'انتهت صلاحية الجلسة. سجّل الدخول مجددًا.', 'SESSION_REVOKED');
  const communityIdentity = (await voiceCommunityIdentities([user.id])).get(user.id);
  return {
    id: user.id,
    accountNumber: user.accountNumber,
    communityIdentity,
    accountBadges: voiceAccountBadges(user),
    tokenVersion: user.tokenVersion,
    name: user.profile?.displayName || user.name || 'عضو تحدي',
    image: user.profile?.avatarUrl || user.image || null,
  };
}

/** SSR display uses the same current account checks without serializing session internals. */
export async function optionalVoiceDisplayIdentity(): Promise<VoiceIdentity | null> {
  try {
    const identity = await voiceIdentity();
    return {
      id: identity.id,
      name: identity.name,
      image: identity.image,
      accountNumber: identity.accountNumber,
      accountBadges: identity.accountBadges,
      communityIdentity: identity.communityIdentity,
    };
  } catch (error) {
    if (error instanceof VoiceHttpError && error.status === 401) return null;
    throw error;
  }
}
const localLimits = new Map<string, { count: number; until: number }>();
export async function voiceRateLimit(userId: string, write: boolean, scope = 'events') {
  const limit = write ? (scope === 'create' ? 5 : 40) : 120;
  const key = `voice-${scope}-${write ? 'write' : 'read'}:${userId}`;
  // The existing shared limiter fails closed in production without Redis.
  if (!(await checkRateLimit(key, limit, 60_000)))
    throw new VoiceHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'RATE_LIMIT');
  if (process.env.NODE_ENV !== 'production') {
    const now = Date.now();
    if (localLimits.size > 5000)
      for (const [id, value] of localLimits) if (value.until < now) localLimits.delete(id);
    const entry = localLimits.get(key);
    if (!entry || entry.until < now) localLimits.set(key, { count: 1, until: now + 60_000 });
    else if (++entry.count > limit)
      throw new VoiceHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'RATE_LIMIT');
  }
}
