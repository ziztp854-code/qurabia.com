import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { EliminationRoom } from '@/components/games/elimination-live/elimination-room';

export const metadata: Metadata = {
  title: 'انضمام لحلقة الإقصاء | تحدي',
  description: 'انضم إلى حلقة إقصاء مباشرة برمز الحلقة.',
};

export default async function EliminationLiveJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <SiteLayout user={null}>
      <EliminationRoom initialRoomCode={code} />
    </SiteLayout>
  );
}
