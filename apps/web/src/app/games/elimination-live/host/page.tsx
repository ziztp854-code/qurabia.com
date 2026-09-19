import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { EliminationRoom } from '@/components/games/elimination-live/elimination-room';
import { requireActiveUser } from '@/lib/auth/session';
import { createHostEliminationAccessToken } from '@/lib/elimination/host-access-token';

export const metadata: Metadata = {
  title: 'بوابة مضيف حلقة الإقصاء | تحدي',
  description: 'مسار محمي لإنشاء حلقة إقصاء مباشرة وإدارتها.',
};

export default async function EliminationLiveHostPage() {
  const user = await requireActiveUser('/games/elimination-live/host');

  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <EliminationRoom
        role="host"
        hostIdentity={{
          hostId: user.id,
          accessToken: createHostEliminationAccessToken(user.id),
        }}
        hostName={user.name ?? 'المضيف'}
      />
    </SiteLayout>
  );
}
