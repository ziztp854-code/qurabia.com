import { getPrismaClient } from '@/lib/auth/prisma';
import { voiceIdentity } from '@/lib/voice/identity';
import { jsonFailure, VoiceHttpError } from '@/lib/voice/http';
import { z } from 'zod';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ emojiId: string }> }) {
  try {
    await voiceIdentity();
    const id = z.uuid().parse((await context.params).emojiId);
    const poster = new URL(request.url).searchParams.get('still') === '1';
    const where = { id, pack: { enabled: true } };
    const db = getPrismaClient();
    const bytes = poster
      ? (await db.voiceEmoji.findFirst({ where, select: { poster: true } }))?.poster
      : (await db.voiceEmoji.findFirst({ where, select: { content: true } }))?.content;
    if (!bytes) throw new VoiceHttpError(404, 'الفيس غير متاح.');
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'X-Content-Type-Options': 'nosniff',
        // Short private caching keeps removed packs revocable without re-uploading IDs.
        'Cache-Control': 'private, max-age=300',
        Vary: 'Cookie',
      },
    });
  } catch (error) {
    return jsonFailure(error);
  }
}
