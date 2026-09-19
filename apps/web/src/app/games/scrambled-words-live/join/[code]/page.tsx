import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { ScrambledWordsRoom } from '@/components/games/scrambled-words-live/scrambled-words-room';

export const metadata: Metadata = {
  title: 'انضمام لكلمات مفككة | تحدي',
  description: 'انضم إلى غرفة كلمات مفككة المباشرة برمز الغرفة.',
};

export default async function ScrambledWordsLiveJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <SiteLayout user={null}>
      <ScrambledWordsRoom initialRoomCode={code} />
    </SiteLayout>
  );
}
