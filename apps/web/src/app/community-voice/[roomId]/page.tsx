import { DashboardLayout } from '@/components/layout';
import { VoiceRoom } from '@/components/community-voice/voice-room';
import { requireActiveUser } from '@/lib/auth/session';

export default async function VoiceRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  await requireActiveUser(`/community-voice/${encodeURIComponent(roomId)}`);
  return (
    <DashboardLayout title="الغرفة الصوتية" breadcrumbLabel="تحدّي لايف">
      <VoiceRoom roomId={roomId} />
    </DashboardLayout>
  );
}
