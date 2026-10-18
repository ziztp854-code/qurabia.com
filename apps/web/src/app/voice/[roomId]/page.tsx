import type { Metadata } from 'next';
import { getCurrentSession } from '@/lib/auth/session';
import { VoiceRoomEntry } from '@/components/voice/voice-room-entry';
export const metadata: Metadata = {
  title: 'الغرفة الصوتية | تحدي لايف',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function VoiceRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const user = (await getCurrentSession())?.user;
  return (
    <VoiceRoomEntry
      roomId={roomId}
      user={
        user?.id
          ? { id: user.id, name: user.name || 'مستخدم تحدي', image: user.image || null }
          : null
      }
    />
  );
}
