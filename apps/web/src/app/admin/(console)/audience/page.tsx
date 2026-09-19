import { AudienceRadar } from '@/components/admin/audience-radar';
import { getAudienceSnapshot } from '@/lib/presence/audience';
import { requireQuestionManager } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminAudiencePage() {
  await requireQuestionManager('/admin/audience');
  const snapshot = await getAudienceSnapshot().catch(() => null);

  return <AudienceRadar initial={snapshot} />;
}
