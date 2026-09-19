import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { ScrambledWordsRoom } from '@/components/games/scrambled-words-live/scrambled-words-room';

export const metadata: Metadata = {
  title: 'كلمات مفككة — مباشرة | تحدي',
  description:
    'سباق مباشر: صورة وكلماتها مقطعة إلى مقاطع، أول من يركب كل الكلمات يتصدر.',
};

export default async function ScrambledWordsLivePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  const roomCode = typeof room === 'string' ? room : undefined;

  return (
    <SiteLayout user={null}>
      <ScrambledWordsRoom initialRoomCode={roomCode} />
    </SiteLayout>
  );
}
