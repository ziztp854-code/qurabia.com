import sharp from 'sharp';
import { VoiceHttpError } from './http';
export const VOICE_COVER_MAX_BYTES = 2 * 1024 * 1024;
const supported = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
export async function normalizeVoiceCover(input: Buffer, contentType: string) {
  if (input.length === 0 || input.length > VOICE_COVER_MAX_BYTES)
    throw new VoiceHttpError(413, 'اختر صورة لا تتجاوز ٢ ميغابايت.');
  const expected = supported.get(contentType);
  if (!expected) throw new VoiceHttpError(415, 'الصور المقبولة: JPEG أو PNG أو WebP.');
  try {
    const image = sharp(input, {
      limitInputPixels: 16_777_216,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== expected ||
      (metadata.pages ?? 1) > 1 ||
      !metadata.width ||
      !metadata.height
    )
      throw new Error('Invalid image format');
    // Re-encoding strips EXIF and active content; store only the decoded image.
    const output = await image
      .rotate()
      .resize(1280, 720, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();
    if (output.length > 350_000)
      throw new VoiceHttpError(413, 'تعذّر تصغير الصورة. اختر غلافًا أبسط.');
    return output;
  } catch (error) {
    if (error instanceof VoiceHttpError) throw error;
    throw new VoiceHttpError(400, 'الصورة تالفة أو نوعها لا يطابق محتواها.');
  }
}
