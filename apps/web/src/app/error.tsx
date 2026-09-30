'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function AppError({
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
    <main className="section">
      <div className="container empty-state" role="alert">
        <h1>تعذّر تحميل الصفحة</h1>
        <p>حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.</p>
        <button type="button" className="button button-primary" onClick={reset}>
          إعادة المحاولة
        </button>
      </div>
    </main>
  );
}
