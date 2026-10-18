import { randomUUID } from 'node:crypto';
import { getPrismaClient } from '@/lib/auth/prisma';
import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonFailure, jsonSuccess, voiceOrigin, VoiceHttpError } from '@/lib/voice/http';
import { normalizeVoiceCover, VOICE_COVER_MAX_BYTES } from '@/lib/voice/cover-image';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_MULTIPART_BYTES = VOICE_COVER_MAX_BYTES + 65536;
async function boundedForm(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data;'))
    throw new VoiceHttpError(415, 'أرسل ملف صورة واحدًا.');
  if (Number(request.headers.get('content-length')) > MAX_MULTIPART_BYTES)
    throw new VoiceHttpError(413, 'الصورة أكبر من المسموح.');
  const reader = request.body?.getReader();
  if (!reader) throw new VoiceHttpError(400, 'اختر صورة للرفع.');
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new VoiceHttpError(413, 'الصورة أكبر من المسموح.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new VoiceHttpError(400, 'ملف الرفع غير صالح.');
  }
}
export async function POST(request: Request) {
  try {
    voiceOrigin(request);
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, true, 'upload');
    const form = await boundedForm(request);
    const files = form.getAll('file');
    if (files.length !== 1 || typeof files[0] === 'string')
      throw new VoiceHttpError(400, 'اختر ملف صورة واحدًا.');
    const file = files[0];
    const content = await normalizeVoiceCover(Buffer.from(await file.arrayBuffer()), file.type);
    const id = randomUUID();
    const db = getPrismaClient();
    await db.$transaction(async (tx) => {
      // Serialize only this user's quota to prevent parallel uploads exceeding it.
      await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtext(${`voice-cover:${user.id}`}))`;
      const count = await tx.voiceCover.count({ where: { ownerId: user.id } });
      if (count >= 20)
        throw new VoiceHttpError(429, 'وصلت إلى حد ٢٠ غلافًا. استخدم غلافًا من المكتبة.');
      await tx.voiceCover.create({
        data: { id, ownerId: user.id, content: new Uint8Array(content) },
      });
    });
    return jsonSuccess({ url: `/api/voice/covers/${id}` }, 201);
  } catch (error) {
    return jsonFailure(error);
  }
}
