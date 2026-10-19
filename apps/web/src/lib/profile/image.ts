import 'server-only';
import sharp from 'sharp';
import { VoiceHttpError } from '@/lib/voice/http';
import { PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_TYPES } from './identity';

/** A bounded multipart read also enforces the limit for chunked requests. */
export async function readProfileForm(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (!type.startsWith('multipart/form-data;'))
    throw new VoiceHttpError(415, 'أرسل بيانات البروفايل مع صورة اختيارية.');
  const limit = PROFILE_IMAGE_MAX_BYTES + 32_768;
  if (Number(request.headers.get('content-length')) > limit)
    throw new VoiceHttpError(413, 'اختر صورة لا تتجاوز ٢ ميغابايت.');
  const reader = request.body?.getReader();
  if (!reader) throw new VoiceHttpError(400, 'بيانات البروفايل فارغة.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new VoiceHttpError(413, 'اختر صورة لا تتجاوز ٢ ميغابايت.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Request('http://localhost/profile', {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new VoiceHttpError(400, 'تعذّر قراءة بيانات البروفايل.');
  }
}

export async function normalizeProfileImage(input: Buffer, type: string) {
  if (!input.length || input.length > PROFILE_IMAGE_MAX_BYTES)
    throw new VoiceHttpError(413, 'اختر صورة لا تتجاوز ٢ ميغابايت.');
  const formats = ['jpeg', 'png', 'webp'];
  const expected = formats[PROFILE_IMAGE_TYPES.indexOf(type)];
  if (!expected) throw new VoiceHttpError(415, 'الصور المقبولة: JPEG أو PNG أو WebP.');
  try {
    const image = sharp(input, {
      limitInputPixels: 16_777_216,
      failOn: 'warning',
      animated: false,
    });
    const meta = await image.metadata();
    if (meta.format !== expected || (meta.pages ?? 1) > 1 || !meta.width || !meta.height)
      throw new Error('Invalid image');
    // Apply orientation, crop square and strip all metadata before storing.
    const content = await image
      .rotate()
      .resize(512, 512, { fit: 'cover' })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    if (content.length > 200_000) throw new VoiceHttpError(413, 'اختر صورة أبسط لتسهيل تحميلها.');
    return content;
  } catch (error) {
    if (error instanceof VoiceHttpError) throw error;
    throw new VoiceHttpError(400, 'الصورة تالفة أو نوعها لا يطابق محتواها.');
  }
}
