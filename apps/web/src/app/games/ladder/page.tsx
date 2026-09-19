import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { LadderRoom } from '@/components/games/ladder/ladder-room';

export const metadata: Metadata = {
  title: 'السلم | تحدي',
  description: 'فريقان يتنافسان على السلم: إجابة صحيحة تصعد، وخاطئة تنزل. أول من يبلغ القمة يفوز.',
};

export default async function LadderPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  const roomCode = typeof room === 'string' ? room : undefined;

  return (
    <SiteLayout user={null}>
      <LadderRoom initialRoomCode={roomCode} />
    </SiteLayout>
  );
}
