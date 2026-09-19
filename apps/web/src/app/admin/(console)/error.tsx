'use client';

import { useEffect } from 'react';

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    // Log the full error to the browser console so the operator can copy it.
    console.error('[admin/console] page error', error);
  }, [error]);

  return (
    <div
      role="alert"
      dir="rtl"
      style={{
        padding: '2rem',
        margin: '1.5rem',
        border: '1px solid #d4af37',
        borderRadius: '12px',
        background: 'rgba(5, 10, 14, 0.85)',
        color: '#f2e8d5',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        maxWidth: '720px',
      }}
    >
      <h1 style={{ color: '#d4af37', margin: '0 0 0.75rem' }}>تعذّر تحميل الصفحة الإدارية</h1>
      <p style={{ margin: '0 0 0.5rem', lineHeight: 1.6 }}>
        حدث خطأ أثناء تنفيذ الاستعلام على الخادم. انسخ التفاصيل أدناه وألصقها لفريق الدعم:
      </p>
      <pre
        style={{
          padding: '0.85rem',
          background: 'rgba(0,0,0,0.4)',
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '0.85rem',
          direction: 'ltr',
          textAlign: 'left',
        }}
      >
        {error.message}
        {error.digest ? `\nDigest: ${error.digest}` : ''}
      </pre>
      <button
        type="button"
        onClick={reset}
        style={{
          marginTop: '1rem',
          padding: '0.5rem 1.25rem',
          background: '#d4af37',
          color: '#050a0e',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
