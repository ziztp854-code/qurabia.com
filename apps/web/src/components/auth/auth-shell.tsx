import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout';

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <Logo />
        <div>
          <h1 id="auth-title">{title}</h1>
          <p>{description}</p>
        </div>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
      <Link className="text-link" href="/">
        العودة للرئيسية
      </Link>
    </main>
  );
}
