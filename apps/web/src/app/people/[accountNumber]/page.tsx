import { notFound, permanentRedirect } from 'next/navigation';
import { canonicalAccountNumber, PUBLIC_ACCOUNT_NUMBER_PATTERN } from '@/lib/account-number';
import { DashboardLayout } from '@/components/layout';
import { CommunityProfilePage } from '@/components/community/profile-view';
import { getPublicProfile } from '@/lib/community/service';

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ accountNumber: string }>;
}) {
  const { accountNumber } = await params;
  if (!PUBLIC_ACCOUNT_NUMBER_PATTERN.test(accountNumber)) notFound();
  const canonical = canonicalAccountNumber(Number(accountNumber));
  if (canonical !== Number(accountNumber)) permanentRedirect(`/people/${canonical}`);
  const profile = await getPublicProfile(Number(accountNumber));
  if (!profile) notFound();
  return (
    <DashboardLayout title="بطاقة عضو" breadcrumbLabel="الملف الشخصي">
      <CommunityProfilePage accountNumber={Number(accountNumber)} initialProfile={profile} />
    </DashboardLayout>
  );
}
