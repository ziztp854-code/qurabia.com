import { getPrismaClient } from '@/lib/auth/prisma';
import { voiceIdentity, voiceRateLimit } from '@/lib/voice/identity';
import { jsonFailure, jsonSuccess } from '@/lib/voice/http';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const user = await voiceIdentity();
    await voiceRateLimit(user.id, false, 'emojis');
    return jsonSuccess(
      await getPrismaClient().voiceEmojiPack.findMany({
        where: { enabled: true },
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
