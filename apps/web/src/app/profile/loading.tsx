import { DashboardLayout } from '@/components/layout';
import { Skeleton } from '@/components/ui';
import styles from '@/components/profile/profile-overview.module.css';
export default function LoadingProfile() {
  return (
    <DashboardLayout title="الملف الشخصي">
      <div className={styles.loading} role="status" aria-label="جارٍ تحميل البروفايل">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    </DashboardLayout>
  );
}
