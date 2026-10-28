import { z } from 'zod';
import { publicGames } from '@/data/games';
import { getPrismaClient } from '@/lib/auth/prisma';
import { voiceActor, voiceRateLimit } from '@/lib/voice/identity';
import { jsonFailure, jsonSuccess, readVoiceBody, voiceOrigin, VoiceHttpError } from '@/lib/voice/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const favoriteSchema = z.object({ gameId: z.string().min(1).max(80), favorite: z.boolean() }).strict();

export async function GET() {
  try {
    const user = await voiceActor();
    await voiceRateLimit(user.id, false, 'game-favorites');
    const favorites = await getPrismaClient().gameFavorite.findMany({
      where: { userId: user.id },
      select: { gameId: true },
    });
    return jsonSuccess({ gameIds: favorites.map((favorite) => favorite.gameId) });
  } catch (error) {
    return jsonFailure(error);
  }
}

export async function PUT(request: Request) {
  try {
    voiceOrigin(request);
    const user = await voiceActor();
    await voiceRateLimit(user.id, true, 'game-favorites');
    const { gameId, favorite } = await readVoiceBody(request, favoriteSchema);
    if (!publicGames.some((game) => game.id === gameId && game.status === 'live')) {
      throw new VoiceHttpError(400, 'اللعبة غير متاحة.', 'INVALID_GAME');
    }
    const favorites = getPrismaClient().gameFavorite;
    if (favorite) {
      await favorites.upsert({ where: { userId_gameId: { userId: user.id, gameId } }, create: { userId: user.id, gameId }, update: {} });
    } else {
      await favorites.deleteMany({ where: { userId: user.id, gameId } });
    }
    return jsonSuccess({ gameId, favorite });
  } catch (error) {
    return jsonFailure(error);
  }
}
