import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { GamePackPicker } from '@/components/games/game-pack-picker';
import { MillionaireRoom } from '@/components/special-games';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import {
  adaptFeedToMillionaireQuestions,
  listQuizPacksForMode,
  resolveQuestionFeed,
} from '@/lib/questions/feed';

export const metadata: Metadata = {
  title: 'من سيربح المليون؟ | تحدّي',
  description: 'رحلة أسئلة متدرجة إلى المليون مع وسائل مساعدة ومحطات أمان.',
};

export default async function MillionairePage({
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
          gameMode: 'MILLIONAIRE',
        }).catch(() => [])
      : [];

  const preferredQuestions =
    quizId && hasDatabaseUrl()
      ? await resolveQuestionFeed({
          gameMode: 'MILLIONAIRE',
          quizId,
          ownerId: session?.user?.id,
          requirePack: true,
          bankTypes: ['MULTIPLE_CHOICE', 'TRUE_FALSE'],
        })
          .then((feed) => adaptFeedToMillionaireQuestions(feed.rows))
          .catch(() => null)
      : null;

  return (
    <SiteLayout user={session?.user ? { name: session.user.name } : null}>
      {session?.user ? (
        <GamePackPicker
          gameMode="MILLIONAIRE"
          packs={packs}
          selectedQuizId={preferredQuestions ? quizId : null}
        />
      ) : null}
      <MillionaireRoom preferredQuestions={preferredQuestions} />
    </SiteLayout>
  );
}
