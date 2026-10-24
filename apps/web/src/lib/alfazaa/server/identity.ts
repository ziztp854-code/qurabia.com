import 'server-only';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { getPrismaClient } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { AlfazaaHttpError } from './http';

export async function alfazaaIdentity() {
  const session = await getCurrentSession();
  if (!session?.user?.id)
    throw new AlfazaaHttpError(401, 'سجّل الدخول لحفظ تقدّم الفزعة على حسابك.');
  const user = await getPrismaClient().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, status: true, tokenVersion: true, role: true },
  });
  if (!isSessionUserCurrent(session.user, user))
    throw new AlfazaaHttpError(401, 'انتهت صلاحية الجلسة. سجّل الدخول مجددًا.');
  return { id: user.id, tokenVersion: user.tokenVersion };
}

export async function alfazaaRateLimit(userId: string, write: boolean) {
  const allowed = await checkRateLimit(
    `alfazaa-${write ? 'write' : 'read'}:${userId}`,
    write ? 90 : 120,
    60_000,
  );
  if (!allowed) throw new AlfazaaHttpError(429, 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.');
}
