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
  searchParams: Promise<{ room?: string; name?: string; team?: string }>;
}) {
  const { room, name, team } = await searchParams;
  const roomCode = typeof room === 'string' ? room : undefined;
  const playerName = typeof name === 'string' ? name.trim() : undefined;
  const playerTeam = team === 'left' || team === 'right' ? team : undefined;

  return (
    <SiteLayout user={null}>
      <LadderRoom initialRoomCode={roomCode} initialPlayerName={playerName} initialTeam={playerTeam} />
    </SiteLayout>
  );
}
