import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getSocialPreferences } from '@/lib/community/social-preferences';
import { ApiHttpError } from '@/lib/http/api';
import type { ProfileGameStats, ProfileIdentityFields } from './identity';

export async function getProfileGameStats(userId: string): Promise<ProfileGameStats> {
  const db = getPrismaClient();
  // Match the live leaderboard's shared first place on tied scores.
  const [stats] = await db.$queryRaw<{ played: bigint; wins: bigint }[]>`
    SELECT count(*) AS played,
      count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1
        FROM "LiveParticipant" opponent
        WHERE opponent."sessionId" = player."sessionId" AND opponent.score > player.score
      )) AS wins
    FROM "LiveParticipant" player
    JOIN "LiveSession" session ON session.id = player."sessionId"
    WHERE player."userId" = ${userId}
      AND session.status = 'FINISHED'
      AND session."startedAt" IS NOT NULL
  `;
  return { played: Number(stats?.played ?? 0), wins: Number(stats?.wins ?? 0) };
}

/** Counts profile follow relationships, excluding inactive or blocked accounts. */
export async function profileSocialCounts(userId: string) {
  const db = getPrismaClient();
  const prefs = await getSocialPreferences(userId);
  const visible = {
    status: 'ACTIVE' as const,
    id: { notIn: [userId, ...prefs.blockedUsers] },
    NOT: {
      voicePreference: { is: { state: { path: ['blockedUsers'], array_contains: [userId] } } },
    },
  };
  const [followers, following] = await Promise.all([
    db.user.count({
      where: {
        ...visible,
        voicePreference: { is: { state: { path: ['following'], array_contains: [userId] } } },
      },
    }),
    db.user.count({ where: { ...visible, id: { ...visible.id, in: prefs.following } } }),
  ]);
  return { followers, following };
}

export async function saveProfileIdentity(
  userId: string,
  fields: ProfileIdentityFields,
  photo?: Buffer | null,
) {
  const db = getPrismaClient();
  const image = photo
    ? `/api/profile/avatar/${userId}?v=${crypto.randomUUID()}`
    : photo === null
      ? null
      : undefined;
  try {
    await db.$transaction(async (tx) => {
      // Recheck account eligibility inside the write; never accept an account ID from the form.
      const active = await tx.user.updateMany({
        where: { id: userId, status: 'ACTIVE' },
        data: { name: fields.displayName, ...(image !== undefined ? { image } : {}) },
      });
      if (!active.count) throw new ApiHttpError(401, 'الحساب غير متاح. سجّل الدخول مجددًا.');
      const data = {
        ...fields,
        ...(image !== undefined
          ? { avatarUrl: image, avatarContent: photo ? new Uint8Array(photo) : null }
          : {}),
      };
      await tx.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
      throw new ApiHttpError(
        409,
        'اسم المستخدم مستخدم بالفعل. اختر اسمًا آخر.',
        'USERNAME_TAKEN',
      );
    throw error;
  }
  const saved = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      image: true,
      profile: { select: { displayName: true, username: true, bio: true, avatarUrl: true } },
    },
  });
  return {
    displayName: saved.profile!.displayName,
    username: saved.profile!.username,
    bio: saved.profile!.bio ?? '',
    image: saved.profile!.avatarUrl || saved.image || null,
  };
}
