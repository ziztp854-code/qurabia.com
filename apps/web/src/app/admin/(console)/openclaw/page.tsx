import { redirect } from 'next/navigation';
import { requireAdminConsole } from '@/lib/auth/session';
import { ApprovalPanel } from './approval-panel';

export default async function OpenClawAdminPage() {
  const actor = await requireAdminConsole('/admin/openclaw');
  if (actor.role !== 'OWNER') redirect('/forbidden');
  return <ApprovalPanel />;
}
