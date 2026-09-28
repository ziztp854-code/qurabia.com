import 'server-only';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/auth/prisma';
import { isManagerRole } from '@/lib/auth/authorization';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { KingdomsHttpError } from './http';

export async function kingdomIdentity(admin = false) {
  const session = await getCurrentSession();
  if (!session?.user?.id) throw new KingdomsHttpError(401, 'سجّل الدخول للعب تحدي الممالك.');
  const user = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(session.user, user))
    throw new KingdomsHttpError(401, 'انتهت صلاحية الجلسة. سجّل الدخول مجددًا.');
  if (admin && !isManagerRole(user.role))
    throw new KingdomsHttpError(403, 'هذه العملية متاحة لإدارة الموقع فقط.');
  return user;
}

export async function kingdomRateLimit(actorId: string, write: boolean) {
  const allowed = await checkRateLimit(
    `kingdoms-${write ? 'write' : 'read'}:${actorId}`,
    write ? 30 : 120,
    60_000,
  );
  if (!allowed) throw new KingdomsHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.');
}
