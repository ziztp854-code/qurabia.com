import { MonitorDashboard } from '@/components/admin/monitor-dashboard';
import { requirePermission } from '@/lib/auth/session';
import { getMonitoringSnapshot } from '@/lib/admin/monitor';

export const dynamic = 'force-dynamic';

export default async function AdminMonitorPage() {
  await requirePermission('VIEW_AUDIT', '/admin/monitor');
  const snapshot = await getMonitoringSnapshot();

  return <MonitorDashboard snapshot={snapshot} />;
}
