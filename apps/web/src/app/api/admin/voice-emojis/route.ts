import { z } from 'zod';
import { getPrismaClient } from '@/lib/auth/prisma';
import { emojiAdmin } from '@/lib/voice/emoji-admin';
import {
  jsonFailure,
  jsonSuccess,
  readVoiceBody,
  voiceOrigin,
  VoiceHttpError,
} from '@/lib/voice/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    await emojiAdmin();
    return jsonSuccess(
      await getPrismaClient().voiceEmojiPack.findMany({
        orderBy: { createdAt: 'asc' },
        take: 30,
        select: {
          id: true,
          name: true,
          enabled: true,
          emojis: {
            select: { id: true, label: true, animated: true },
            orderBy: { id: 'asc' },
          },
        },
      }),
    );
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    voiceOrigin(request);
    const user = await emojiAdmin();
    const data = await readVoiceBody(
      request,
      z.object({ name: z.string().trim().min(2).max(60) }).strict(),
    );
    const pack = await getPrismaClient().$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('voice-emoji-packs'))`;
      if ((await tx.voiceEmojiPack.count()) >= 30)
        throw new VoiceHttpError(429, 'الحد الأقصى 30 حزمة.');
      return tx.voiceEmojiPack.create({
        data: { ...data, createdBy: user.id },
        select: { id: true },
      });
    });
    return jsonSuccess(pack, 201);
  } catch (error) {
    return jsonFailure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    voiceOrigin(request);
    await emojiAdmin();
    const data = await readVoiceBody(
      request,
      z.object({ id: z.uuid(), enabled: z.boolean() }).strict(),
    );
    const result = await getPrismaClient().voiceEmojiPack.updateMany({
      where: { id: data.id },
      data: { enabled: data.enabled },
    });
    if (!result.count) throw new VoiceHttpError(404, 'الحزمة غير موجودة.');
    return jsonSuccess({ ok: true });
  } catch (error) {
    return jsonFailure(error);
  }
}
