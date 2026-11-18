import 'server-only';
import type { Prisma } from '@tahaddi/database';
import { getPrismaClient } from '@/lib/auth/prisma';
import { ApiHttpError } from '@/lib/http/api';

const defaults = (): { following: string[]; blockedUsers: string[]; privateProfile: boolean } => ({
  following: [],
  blockedUsers: [],
  privateProfile: false,
});

// Existing account privacy and follow relationships are stored in the legacy preference table.
export async function getSocialPreferences(userId: string) {
  const stored = await getPrismaClient().voicePreference.findUnique({ where: { userId } });
  return { ...defaults(), ...(stored?.state as Prisma.JsonObject | undefined) };
}

export async function updateFollowPreference(userId: string, targetId: string, follow: boolean) {
  if (targetId === userId) throw new ApiHttpError(400, 'هذا الإجراء يتطلب عضوًا آخر.');
  const db = getPrismaClient();
  if (!(await db.user.findFirst({
    where: { id: targetId, status: 'ACTIVE' },
    select: { id: true },
  })))
    throw new ApiHttpError(404, 'العضو غير موجود.');

  if (follow) {
    const [self, target] = await Promise.all([
      getSocialPreferences(userId),
      getSocialPreferences(targetId),
    ]);
    if (self.blockedUsers.includes(targetId) || target.blockedUsers.includes(userId))
      throw new ApiHttpError(403, 'المتابعة غير متاحة لهذا العضو.');
  }

  await db.voicePreference.upsert({
    where: { userId },
    create: { userId, state: defaults() },
    update: {},
  });
  for (let attempt = 0; attempt < 8; attempt++) {
    const stored = await db.voicePreference.findUniqueOrThrow({ where: { userId } });
    const state = { ...defaults(), ...(stored.state as Prisma.JsonObject) };
    const following = state.following.filter((id) => id !== targetId);
    if (follow && following.length >= 500)
      throw new ApiHttpError(409, 'وصلت إلى الحد الأقصى لهذه القائمة.');
    const updated = await db.voicePreference.updateMany({
      where: { userId, revision: stored.revision },
      data: {
        state: { ...state, following: follow ? [...following, targetId] : following },
        revision: { increment: 1 },
      },
    });
    if (updated.count) return;
  }
  throw new ApiHttpError(409, 'تغيرت الإعدادات. حاول مجددًا.', 'CONFLICT');
}
