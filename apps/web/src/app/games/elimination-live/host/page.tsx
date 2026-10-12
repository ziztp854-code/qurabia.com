import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { EliminationRoom } from '@/components/games/elimination-live/elimination-room';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostEliminationAccessToken } from '@/lib/elimination/host-access-token';
import { AiGameQuestionRefresh } from '@/components/games/ai-game-question-refresh';

export const metadata: Metadata = {
  title: 'بوابة مضيف حلقة الإقصاء | تحدي',
  description: 'مسار محمي لإنشاء حلقة إقصاء مباشرة وإدارتها.',
};

export default async function EliminationLiveHostPage({ searchParams }: { searchParams: Promise<{ quizId?: string }> }) {
  const user = await requireActiveUser('/games/elimination-live/host');
  const { quizId } = await searchParams;

  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <AiGameQuestionRefresh game="elimination-live">
      <EliminationRoom
        quizId={quizId}
        role="host"
        hostIdentity={{
          hostId: user.id,
          accessToken: createHostEliminationAccessToken(user.id),
        }}
        hostName={user.name ?? 'المضيف'}
      />
      </AiGameQuestionRefresh>
    </SiteLayout>
  );
}
