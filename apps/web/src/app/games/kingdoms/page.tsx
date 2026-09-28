import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { requireActiveUser } from '@/lib/auth/session';
import { KingdomsClient } from '@/components/kingdoms/kingdoms-client';

export const metadata: Metadata = {
  title: 'تحدي الممالك | تحدي',
  description: 'ابنِ مملكتك، كوّن تحالفك، وتنافس على عرش تحدي في عالم استراتيجي مستمر.',
};

export default async function KingdomsPage() {
  const user = await requireActiveUser('/games/kingdoms');
  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <KingdomsClient canManage={user.role === 'ADMIN' || user.role === 'OWNER'} />
    </SiteLayout>
  );
}
