import '@xyflow/react/dist/style.css';
import type { Metadata } from 'next';
import { ArchitectureMap } from '@/components/architecture';
import { requirePermission } from '@/lib/auth/session';
import { getArchitectureLiveData } from '@/lib/architecture/live-data';

export const metadata: Metadata = {
  title: 'خريطة بنية قرابيا',
  description: 'خريطة تفاعلية محمية لبنية منصة قرابيا ومساراتها وخدماتها وبياناتها.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ArchitecturePage() {
  await requirePermission('VIEW_AUDIT', '/architecture');
  const liveData = await getArchitectureLiveData();
  return <ArchitectureMap liveData={liveData} />;
}
