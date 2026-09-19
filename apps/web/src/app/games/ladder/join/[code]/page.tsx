import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { JoinLadder } from '@/components/games/ladder/join-ladder';

export const metadata: Metadata = {
  title: 'انضمام للسلم | تحدي',
  description: 'انضم إلى لعبة السلم برمز الغرفة.',
};

export default async function LadderJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  return (
    <SiteLayout user={null}>
      <JoinLadder roomCode={code} />
    </SiteLayout>
  );
}
