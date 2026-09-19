import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function QuestionBankShell({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('question-bank', className)} {...props}>
      <span className="qb-guides" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      {children}
    </div>
  );
}
