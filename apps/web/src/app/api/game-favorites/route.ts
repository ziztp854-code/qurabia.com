import { z } from 'zod';
import { publicGames } from '@/data/games';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireApiActor, limitApiActor } from '@/lib/auth/api-actor';
import { jsonFailure, jsonSuccess, readJsonBody, assertApiOrigin, ApiHttpError } from '@/lib/http/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const favoriteSchema = z.object({ gameId: z.string().min(1).max(80), favorite: z.boolean() }).strict();

export async function GET() {
  try {
    const user = await requireApiActor();
    await limitApiActor(user.id, false, 'game-favorites');
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
    assertApiOrigin(request);
    const user = await requireApiActor();
    await limitApiActor(user.id, true, 'game-favorites');
    const { gameId, favorite } = await readJsonBody(request, favoriteSchema);
    if (!publicGames.some((game) => game.id === gameId && game.status === 'live')) {
      throw new ApiHttpError(400, 'اللعبة غير متاحة.', 'INVALID_GAME');
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
