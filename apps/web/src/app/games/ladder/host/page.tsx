import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { GamePackPicker } from '@/components/games/game-pack-picker';
import { LadderRoom } from '@/components/games/ladder/ladder-room';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostLadderAccessToken } from '@/lib/ladder/host-access-token';
import { listQuizPacksForMode, loadQuizPackQuestions } from '@/lib/questions/feed';

export const metadata: Metadata = {
  title: 'بوابة مضيف السلم | تحدي',
  description: 'مسار محمي لإنشاء غرفة لعبة السلم وإدارتها.',
};

export default async function LadderHostPage({
  searchParams,
}: {
  searchParams: Promise<{ quizId?: string }>;
}) {
  const [{ quizId }, user] = await Promise.all([
    searchParams,
    requireActiveUser('/games/ladder/host'),
  ]);

  const packs = hasDatabaseUrl()
    ? await listQuizPacksForMode({ ownerId: user.id, gameMode: 'LADDER' }).catch(() => [])
    : [];

  let packTitle: string | null = null;
  let resolvedQuizId: string | null = null;
  if (quizId && hasDatabaseUrl()) {
    try {
      const pack = await loadQuizPackQuestions(quizId, 'LADDER', { ownerId: user.id });
      resolvedQuizId = pack.quizId;
      packTitle = pack.quizTitle;
    } catch {
      resolvedQuizId = null;
    }
  }

  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <GamePackPicker gameMode="LADDER" packs={packs} selectedQuizId={resolvedQuizId} />
      <LadderRoom
        role="host"
        quizId={resolvedQuizId}
        packTitle={packTitle}
        hostIdentity={{
          hostId: user.id,
          accessToken: createHostLadderAccessToken(user.id),
        }}
        hostName={user.name ?? 'المضيف'}
      />
    </SiteLayout>
  );
}
