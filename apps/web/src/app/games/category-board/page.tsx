import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { GamePackPicker } from '@/components/games/game-pack-picker';
import { CategoryBoardRoom } from '@/components/special-games/category-board-room';
import { CATEGORY_BOARD_LIBRARY } from '@/components/special-games/category-board-data';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import {
  adaptFeedToCategoryBoardLibrary,
  listQuizPacksForMode,
  resolveQuestionFeed,
} from '@/lib/questions/feed';

export const metadata: Metadata = {
  title: 'لوحة الفئات | تحدّي',
  description: 'لعبة فئات لفريقين مع لوحة مضيف، مؤقت، تحكيم ووسائل مساعدة.',
};

export default async function CategoryBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ quizId?: string }>;
}) {
  const [{ quizId }, session] = await Promise.all([
    searchParams,
    getCurrentSession().catch(() => null),
  ]);

  const packs =
    session?.user && hasDatabaseUrl()
      ? await listQuizPacksForMode({
          ownerId: session.user.id,
          gameMode: 'CATEGORY_BOARD',
        }).catch(() => [])
      : [];

  const adaptedLibrary =
    quizId && hasDatabaseUrl()
      ? await resolveQuestionFeed({
          gameMode: 'CATEGORY_BOARD',
          quizId,
          ownerId: session?.user?.id,
          requirePack: true,
        })
          .then((feed) => adaptFeedToCategoryBoardLibrary(feed.rows))
          .catch(() => null)
      : null;

  const library =
    adaptedLibrary && adaptedLibrary.length >= 6
      ? adaptedLibrary
      : CATEGORY_BOARD_LIBRARY;

  return (
    <SiteLayout user={session?.user ? { name: session.user.name } : null}>
      {session?.user ? (
        <GamePackPicker
          gameMode="CATEGORY_BOARD"
          packs={packs}
          selectedQuizId={adaptedLibrary && adaptedLibrary.length >= 6 ? quizId : null}
        />
      ) : null}
      <CategoryBoardRoom library={library} />
    </SiteLayout>
  );
}
