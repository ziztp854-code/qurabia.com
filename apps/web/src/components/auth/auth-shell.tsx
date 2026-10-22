import Link from 'next/link';
import styles from './auth-live.module.css';
import type { ReactNode } from 'react';
import { Logo } from '@/components/layout';

export function AuthShell({
  title,
  description,
  children,
  footer,
  live = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  live?: boolean;
}) {
  return (
    <main className={`auth-page ${live ? `v-app ${styles.live}` : ''}`}>
      <section className="auth-panel" aria-labelledby="auth-title">
        {live ? (
          <div className={styles.identity}>
            <span>تحدي لايف</span>
            <p>صوتك… يصنع الفرق</p>
          </div>
        ) : (
          <Logo />
        )}
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
