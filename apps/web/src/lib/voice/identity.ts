import { voiceAccountBadges, voiceBadgeAccountSelect } from './account-badges';
import 'server-only';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { VoiceHttpError } from './http';
import type { VoiceIdentity } from './types';
export async function voiceIdentity(): Promise<VoiceIdentity> {
  const session = await getCurrentSession();
  if (!session?.user?.id)
    throw new VoiceHttpError(401, 'سجّل الدخول للانضمام إلى تحدي لايف.', 'AUTH_REQUIRED');
  const user = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
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
  return {
    id: user.id,
    accountBadges: voiceAccountBadges(user),
    tokenVersion: user.tokenVersion,
    name: user.profile?.displayName || user.name || 'عضو تحدي',
    image: user.profile?.avatarUrl || user.image || null,
  };
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
