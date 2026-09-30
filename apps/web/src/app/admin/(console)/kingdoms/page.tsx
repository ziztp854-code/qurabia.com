import { requirePermission } from '@/lib/auth/session';
import { KingdomsAdmin } from '@/components/kingdoms/kingdoms-admin';

export default async function KingdomsAdminPage() {
  await requirePermission('MANAGE_USERS', '/admin/kingdoms');
  return <KingdomsAdmin />;
}
