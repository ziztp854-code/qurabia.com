import { DashboardLayout } from '@/components/layout';
import { VoiceLobby } from '@/components/community-voice/voice-lobby';
import { requireActiveUser } from '@/lib/auth/session';

export default async function VoiceLobbyPage() {
  await requireActiveUser('/community-voice');
  return (
    <DashboardLayout title="المجالس الصوتية" breadcrumbLabel="تحدّي لايف">
      <VoiceLobby />
    </DashboardLayout>
  );
}
