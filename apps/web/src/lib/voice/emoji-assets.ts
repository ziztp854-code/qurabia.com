import sharp from 'sharp';
import { VoiceHttpError } from './http';

export const EMOJI_MAX_BYTES = 512 * 1024;
export async function normalizeEmoji(bytes: Buffer, mime: string) {
  if (mime !== 'image/webp' || bytes.length < 12 || bytes.length > EMOJI_MAX_BYTES)
    throw new VoiceHttpError(413, 'ارفع WebP بحجم لا يتجاوز 512 كيلوبايت.');
  try {
    const image = sharp(bytes, {
      animated: true,
      limitInputPixels: 256 * 256 * 60,
    });
    const info = await image.metadata();
    const pages = info.pages ?? 1;
    if (
      info.format !== 'webp' ||
      !info.width ||
      !info.height ||
      info.width > 256 ||
      (info.pageHeight ?? info.height) > 256 ||
      pages > 60 ||
      (info.delay ?? []).reduce((sum, delay) => sum + delay, 0) > 6000
    )
      throw new Error('dimensions');
    const content = await image.webp({ quality: 85, effort: 3 }).toBuffer();
    if (content.length > EMOJI_MAX_BYTES) throw new Error('size');
    const poster = await sharp(bytes, { page: 0 }).webp({ quality: 85 }).toBuffer();
    return {
      content: new Uint8Array(content),
      poster: new Uint8Array(poster),
      animated: pages > 1,
    };
  } catch {
    throw new VoiceHttpError(400, 'الفيس غير صالح: أقصى أبعاد 256×256، و60 إطارًا، وست ثوانٍ.');
  }
}
