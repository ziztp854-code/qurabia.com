import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin';
import { getOptionalAdminConsoleUser } from '@/lib/auth/session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getOptionalAdminConsoleUser();
  return user ? (
    <AdminShell role={user.role} name={user.name}>
      {children}
    </AdminShell>
  ) : (
    children
  );
}
