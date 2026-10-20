import type { Metadata } from 'next';
import { optionalVoiceDisplayIdentity } from '@/lib/voice/identity';
import { VoiceRoomEntry } from '@/components/voice/voice-room-entry';
export const metadata: Metadata = {
  title: 'الغرفة الصوتية | تحدي لايف',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function VoiceRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const user = await optionalVoiceDisplayIdentity();
  return <VoiceRoomEntry roomId={roomId} user={user} />;
}
