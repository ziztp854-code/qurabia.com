import { notFound } from 'next/navigation';
import { DashboardLayout } from '@/components/layout';
import { CommunityProfilePage } from '@/components/community/profile-view';
import { getPublicProfile } from '@/lib/community/service';

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ accountNumber: string }>;
}) {
  const { accountNumber } = await params;
  if (!/^(?:1|[1-9]\d{8})$/.test(accountNumber)) notFound();
  const profile = await getPublicProfile(Number(accountNumber));
  if (!profile) notFound();
  return (
    <DashboardLayout title="بطاقة عضو" breadcrumbLabel="الملف الشخصي">
      <CommunityProfilePage accountNumber={Number(accountNumber)} initialProfile={profile} />
    </DashboardLayout>
  );
}
