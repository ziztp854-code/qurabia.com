import { NextResponse } from 'next/server';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { getAudienceSnapshot } from '@/lib/presence/audience';

export async function GET() {
  const session = await getCurrentSession();
  const sessionUser = session?.user;
  if (!sessionUser?.id || typeof sessionUser.tokenVersion !== 'number') {
    return NextResponse.json({ ok: false, message: 'سجّل الدخول أولًا.' }, { status: 401 });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, message: 'قاعدة البيانات غير مهيأة.' }, { status: 503 });
  }

  const storedUser = await getPrismaClient().user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(sessionUser, storedUser)) {
    return NextResponse.json({ ok: false, message: 'انتهت الجلسة.' }, { status: 401 });
  }
  if (!canManageQuestions(storedUser.role)) {
    return NextResponse.json({ ok: false, message: 'هذه اللوحة للمدير والأدمن فقط.' }, { status: 403 });
  }

  const snapshot = await getAudienceSnapshot();
  return NextResponse.json(
    { ok: true, ...snapshot },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
