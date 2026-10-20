import { DashboardLayout } from '@/components/layout';
import { AppearanceEditor } from '@/components/community/appearance-editor';
import { requireActiveUser } from '@/lib/auth/session';

export default async function AppearancePage() {
  await requireActiveUser('/profile/appearance');
  return (
    <DashboardLayout title="مظهري وإعداداتي" breadcrumbLabel="مظهري">
      <AppearanceEditor />
    </DashboardLayout>
  );
}
