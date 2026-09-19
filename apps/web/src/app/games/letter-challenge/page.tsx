import type { Metadata } from 'next';
import { LetterGame } from '@/components/letter-game';
import { GamePackPicker } from '@/components/games/game-pack-picker';
import { SiteLayout } from '@/components/layout';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import {
  adaptFeedToLetterQuestions,
  listQuizPacksForMode,
  resolveQuestionFeed,
} from '@/lib/questions/feed';

export const metadata: Metadata = {
  title: 'تحدي الحروف | تحدّي',
  description: 'لعبة فرق عربية على شبكة سداسية: امتلك الحروف بالإجابات الصحيحة وابنِ طريق الفوز.',
};

export default async function LetterChallengePage({
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
          gameMode: 'LETTER_CHALLENGE',
        }).catch(() => [])
      : [];

  const questions = hasDatabaseUrl()
    ? await resolveQuestionFeed({
        gameMode: 'LETTER_CHALLENGE',
        quizId,
        ownerId: session?.user?.id,
        bankTypes: ['SHORT_ANSWER'],
        bankTake: 1_500,
      })
        .then((feed) => adaptFeedToLetterQuestions(feed.rows))
        .catch(() => undefined)
    : undefined;

  return (
    <SiteLayout user={session?.user ? { name: session.user.name, role: session.user.role } : null}>
      {session?.user ? (
        <GamePackPicker
          gameMode="LETTER_CHALLENGE"
          packs={packs}
          selectedQuizId={quizId ?? null}
        />
      ) : null}
      <LetterGame questions={questions} />
    </SiteLayout>
  );
}
