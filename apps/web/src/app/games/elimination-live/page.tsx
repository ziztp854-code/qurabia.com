import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { EliminationRoom } from '@/components/games/elimination-live/elimination-room';

export const metadata: Metadata = {
  title: 'حلقة الإقصاء — مباشرة | تحدي',
  description:
    'مسرح إقصاء مباشر: سؤال واحد في كل جولة، كل من يخطئ يُقصى فورًا، وناجٍ واحد يرتفع إلى المنصة.',
};

export default async function EliminationLivePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  const roomCode = typeof room === 'string' ? room : undefined;

  return (
    <SiteLayout user={null}>
      <EliminationRoom initialRoomCode={roomCode} />
    </SiteLayout>
  );
}
