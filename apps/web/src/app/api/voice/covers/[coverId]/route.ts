import { getPrismaClient } from '@/lib/auth/prisma';
import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonFailure, VoiceHttpError } from '@/lib/voice/http';
import type { VoiceRoomState } from '@/lib/voice/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ coverId: string }> }) {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false, 'cover');
    const { coverId } = await context.params;
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(coverId))
      throw new VoiceHttpError(404, 'الغلاف غير موجود.');
    const db = getPrismaClient();
    const cover = await db.voiceCover.findUnique({ where: { id: coverId } });
    if (!cover) throw new VoiceHttpError(404, 'الغلاف غير موجود.');
    if (cover.ownerId !== user.id) {
      const rooms = await db.voiceRoom.findMany({
        where: {
          active: true,
          state: { path: ['settings', 'cover'], equals: `/api/voice/covers/${coverId}` },
        },
        select: { state: true, isPrivate: true },
      });
      const allowed = rooms.some((room) => {
        const state = room.state as unknown as VoiceRoomState;
        return (
          !state.bannedUsers.includes(user.id) &&
          (!room.isPrivate ||
            state.participants.some((p) => p.id === user.id && Date.now() - p.lastSeenAt < 90_000))
        );
      });
      if (!allowed) throw new VoiceHttpError(404, 'الغلاف غير موجود.');
    }
    return new Response(new Uint8Array(cover.content), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(cover.content.length),
        'Cache-Control': 'private, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return jsonFailure(error);
  }
}
