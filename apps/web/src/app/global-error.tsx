'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureMessage('Application error');
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{ background: '#050a0e', color: '#f2e8d5', fontFamily: 'system-ui, sans-serif' }}
      >
        <main
          role="alert"
          style={{ maxWidth: 640, margin: '15vh auto', padding: 24, textAlign: 'center' }}
        >
          <h1>تعذّر تحميل الموقع</h1>
          <p>حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.</p>
          <button type="button" onClick={reset}>
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
