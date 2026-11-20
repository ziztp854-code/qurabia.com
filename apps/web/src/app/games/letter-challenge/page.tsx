import { AiGameQuestionRefresh } from '@/components/games/ai-game-question-refresh';
import type { Metadata } from 'next';
import { LetterGame } from '@/components/letter-game';
import { GamePackPicker } from '@/components/games/game-pack-picker';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { getCurrentSession } from '@/lib/auth/session';
import {
  adaptFeedToLetterQuestions,
  listQuizPacksForMode,
  playHrefForPack,
  resolveQuestionFeed,
} from '@/lib/questions/feed';

export const metadata: Metadata = {
  title: 'تحدي الحروف | تحدّي',
  description: 'لعبة فرق عربية على شبكة سداسية: امتلك الحروف بالإجابات الصحيحة وابنِ طريق الفوز.',
};

export default async function LetterChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ quizId?: string | string[] }>;
}) {
  const [params, session] = await Promise.all([
    searchParams,
    getCurrentSession().catch(() => null),
  ]);
  const quizId = typeof params.quizId === 'string' ? params.quizId : undefined;
  const playHref = playHrefForPack('LETTER_CHALLENGE', quizId);

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
        bankTypes: ['SHORT_ANSWER', 'MULTIPLE_CHOICE'],
        bankTake: 1_500,
      })
        .then((feed) => adaptFeedToLetterQuestions(feed.rows))
        .catch(() => undefined)
    : undefined;

  return (
    <main id="main-content">
      <AiGameQuestionRefresh
        key={quizId ?? 'bank'}
        game="letter-challenge"
        inlineControls
        showExternalTopicNotice
        signInHref={`/auth/sign-in?next=${encodeURIComponent(playHref)}`}
      >
        <LetterGame
          questions={questions}
          savedPacks={
            session?.user && (packs.length > 0 || quizId) ? (
              <GamePackPicker gameMode="LETTER_CHALLENGE" packs={packs} selectedQuizId={quizId} />
            ) : undefined
          }
        />
      </AiGameQuestionRefresh>
    </main>
  );
}
