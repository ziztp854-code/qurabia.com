import { revalidatePath } from 'next/cache';
import { profileIdentitySchema } from '@/lib/profile/identity';
import { normalizeProfileImage, readProfileForm } from '@/lib/profile/image';
import { saveProfileIdentity } from '@/lib/profile/repository';
import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonFailure, jsonSuccess, VoiceHttpError, voiceOrigin } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'profile');
    const form = await readProfileForm(request);
    for (const key of ['displayName', 'username', 'bio', 'removeImage', 'image'])
      if (form.getAll(key).length > 1) throw new VoiceHttpError(400, 'أرسل قيمة واحدة لكل حقل.');
    const result = profileIdentitySchema.safeParse({
      displayName: form.get('displayName'),
      username: form.get('username'),
      bio: form.get('bio') ?? '',
    });
    if (!result.success)
      return jsonSuccess(
        { error: 'تحقق من بيانات البروفايل.', fields: result.error.flatten().fieldErrors },
        400,
      );
    const file = form.get('image');
    const remove = form.get('removeImage') === 'true';
    if (file && (typeof file === 'string' || remove))
      throw new VoiceHttpError(400, 'اختر رفع صورة أو حذفها.');
    const photo =
      file && typeof file !== 'string'
        ? await normalizeProfileImage(Buffer.from(await file.arrayBuffer()), file.type)
        : remove
          ? null
          : undefined;
    const profile = await saveProfileIdentity(user.id, result.data, photo);
    revalidatePath('/profile');
    return jsonSuccess({ profile });
  } catch (error) {
    return jsonFailure(error);
  }
}
