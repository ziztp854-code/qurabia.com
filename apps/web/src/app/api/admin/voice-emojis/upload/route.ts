import { z } from 'zod';
import { getPrismaClient } from '@/lib/auth/prisma';
import { emojiAdmin } from '@/lib/voice/emoji-admin';
import { normalizeEmoji, EMOJI_MAX_BYTES } from '@/lib/voice/emoji-assets';
import { jsonFailure, jsonSuccess, voiceOrigin, VoiceHttpError } from '@/lib/voice/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    voiceOrigin(request);
    await emojiAdmin();
    const type = request.headers.get('content-type') ?? '';
    if (!type.startsWith('multipart/form-data;'))
      throw new VoiceHttpError(415, 'استخدم رفع الملفات.');
    const limit = EMOJI_MAX_BYTES + 16384;
    if (Number(request.headers.get('content-length')) > limit)
      throw new VoiceHttpError(413, 'الملف كبير.');
    const reader = request.body?.getReader();
    if (!reader) throw new VoiceHttpError(400, 'اختر ملفًا.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > limit) {
          await reader.cancel();
          throw new VoiceHttpError(413, 'الملف كبير.');
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let form: FormData;
    try {
      form = await new Request('http://localhost/upload', {
        method: 'POST',
        headers: { 'Content-Type': type },
        body: Buffer.concat(chunks),
      }).formData();
    } catch {
      throw new VoiceHttpError(400, 'ملف الرفع غير صالح.');
    }
    const packId = z.uuid().parse(form.get('packId'));
    const label = z.string().trim().min(1).max(40).parse(form.get('label'));
    const files = form.getAll('file');
    if (files.length !== 1 || typeof files[0] === 'string')
      throw new VoiceHttpError(400, 'اختر فيسًا واحدًا.');
    const file = files[0];
    const asset = await normalizeEmoji(Buffer.from(await file.arrayBuffer()), file.type);
    const result = await getPrismaClient().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`voice-emoji:${packId}`}))`;
      if (
        !(await tx.voiceEmojiPack.findUnique({
          where: { id: packId },
          select: { id: true },
        }))
      )
        throw new VoiceHttpError(404, 'الحزمة غير موجودة.');
      if ((await tx.voiceEmoji.count({ where: { packId } })) >= 40)
        throw new VoiceHttpError(429, 'الحد الأقصى 40 فيسًا للحزمة.');
      return tx.voiceEmoji.create({
        data: { packId, label, ...asset },
        select: { id: true },
      });
    });
    return jsonSuccess(result, 201);
  } catch (error) {
    return jsonFailure(error);
  }
}
