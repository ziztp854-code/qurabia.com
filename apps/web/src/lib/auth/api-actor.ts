import 'server-only';
import { ApiHttpError } from '@/lib/http/api';
import { getPrismaClient } from './prisma';
import { checkRateLimit } from './rate-limit';
import { getCurrentSession } from './session';
import { isSessionUserCurrent } from './session-user';

export async function requireApiActor(): Promise<{ id: string }> {
  const session = await getCurrentSession();
  if (!session?.user?.id)
    throw new ApiHttpError(401, 'سجّل الدخول للمتابعة.', 'AUTH_REQUIRED');
  const user = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(session.user, user))
    throw new ApiHttpError(401, 'انتهت صلاحية الجلسة. سجّل الدخول مجددًا.', 'SESSION_REVOKED');
  return { id: user.id };
}

const localLimits = new Map<string, { count: number; until: number }>();
export async function limitApiActor(
  userId: string,
  write: boolean,
  scope: 'profile' | 'game-favorites',
) {
  const limit = write ? 40 : 120;
  // Reuse existing distributed buckets when rolling out these routes.
  const key = `voice-${scope}-${write ? 'write' : 'read'}:${userId}`;
  if (!(await checkRateLimit(key, limit, 60_000)))
    throw new ApiHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'RATE_LIMIT');
  if (process.env.NODE_ENV !== 'production') {
    const now = Date.now();
    if (localLimits.size > 5000)
      for (const [id, value] of localLimits) if (value.until < now) localLimits.delete(id);
    const entry = localLimits.get(key);
    if (!entry || entry.until < now) localLimits.set(key, { count: 1, until: now + 60_000 });
    else if (++entry.count > limit)
      throw new ApiHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'RATE_LIMIT');
  }
}
