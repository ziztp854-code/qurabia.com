import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getVoicePreferences } from '@/lib/voice/repository';
import { VoiceHttpError } from '@/lib/voice/http';
import type { ProfileIdentityFields } from './identity';

/** Counts the same follow relationships used by voice, excluding inactive/blocked accounts. */
export async function profileSocialCounts(userId: string) {
  const db = getPrismaClient();
  const prefs = await getVoicePreferences(userId);
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
      if (!active.count) throw new VoiceHttpError(401, 'الحساب غير متاح. سجّل الدخول مجددًا.');
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
      throw new VoiceHttpError(
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
