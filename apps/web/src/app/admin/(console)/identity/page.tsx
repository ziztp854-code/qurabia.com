import { AdminIdentity } from '@/components/community/admin-identity';
import { requirePermission } from '@/lib/auth/session';

export default async function IdentityAdminPage() {
  const actor = await requirePermission('MANAGE_USERS', '/admin/identity');
  return <AdminIdentity canGrantSensitive={actor.role === 'OWNER'} />;
}
