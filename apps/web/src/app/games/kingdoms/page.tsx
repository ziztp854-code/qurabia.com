import type { Metadata } from 'next';
import { SiteLayout } from '@/components/layout';
import { requireActiveUser } from '@/lib/auth/session';
import { KingdomsClient } from '@/components/kingdoms/kingdoms-client';

export const metadata: Metadata = {
  title: 'تحدي الممالك | تحدي',
  description: 'ابنِ مملكتك، كوّن تحالفك، وتنافس على عرش تحدي في عالم استراتيجي مستمر.',
};

export default async function KingdomsPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const query = await searchParams;
  const parameter = (key: string) =>
    typeof query?.[key] === 'string' && query[key].length <= 256 ? query[key] : '';
  const initialWorldId = parameter('worldId');
  const initialVillageId = parameter('villageId');
  const initialTab = parameter('tab') === 'village' ? 'village' : 'overview';
  const returnQuery = new URLSearchParams();
  if (initialWorldId) returnQuery.set('worldId', initialWorldId);
  if (initialVillageId) returnQuery.set('villageId', initialVillageId);
  if (initialTab === 'village') returnQuery.set('tab', initialTab);
  const user = await requireActiveUser(
    `/games/kingdoms${returnQuery.size ? `?${returnQuery}` : ''}`,
  );
  return (
    <SiteLayout user={{ name: user.name, role: user.role }}>
      <KingdomsClient
        key={`${initialWorldId}:${initialVillageId}:${initialTab}`}
        canManage={user.role === 'ADMIN' || user.role === 'OWNER'}
        initialWorldId={initialWorldId}
        initialVillageId={initialVillageId}
        initialTab={initialTab}
      />
    </SiteLayout>
  );
}
