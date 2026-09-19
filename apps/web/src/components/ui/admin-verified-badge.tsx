import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function AdminVerifiedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('admin-verified-badge', className)}
      role="img"
      aria-label="مدير موثّق"
      title="مدير موثّق"
    >
      <svg aria-hidden="true" viewBox="0 0 32 32" focusable="false">
        <path d="M16 1.5l3.1 3.1 4.3-1 1.1 4.3 4.2 1.3-1.1 4.3 3 3.2-3 3.2 1.1 4.3-4.2 1.3-1.1 4.3-4.3-1L16 30.5l-3.1-3.1-4.3 1-1.1-4.3-4.2-1.3 1.1-4.3-3-3.2 3-3.2-1.1-4.3 4.2-1.3 1.1-4.3 4.3 1L16 1.5z" />
      </svg>
      <Check aria-hidden="true" />
    </span>
  );
}

export function AdminVerifiedName({
  children,
  isManager,
  className,
}: {
  children: ReactNode;
  isManager: boolean;
  className?: string;
}) {
  return (
    <span className={cn('admin-verified-name', className)}>
      <span>{children}</span>
      {isManager && <AdminVerifiedBadge />}
    </span>
  );
}
