'use client';

import { useState, useTransition } from 'react';
import { Button, Input } from '@/components/ui';
import pageStyles from './question-bank-page.module.css';

/**
 * Destructive bank cleanup actions kept as a client island
 * so the questions page can stay a server component.
 */
export function QuestionBankCleanupActions() {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cleanOddQuestions() {
    startTransition(async () => {
      setMessage(null);
      const confirmed = window.confirm(
        'سيتم حذف الأسئلة غير العربية المصدر أو المؤرشفة حسب قواعد التنظيف. هل تريد المتابعة؟',
      );
      if (!confirmed) return;

      const res = await fetch('/api/admin/clean-questions', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { deletedCount?: number; error?: string };
      if (!res.ok) {
        setMessage(data.error || 'فشل تنظيف الأسئلة.');
        return;
      }
      setMessage(`تم حذف ${data.deletedCount ?? 0} سؤالاً.`);
      window.location.reload();
    });
  }

  function deleteSimilar() {
    startTransition(async () => {
      setMessage(null);
      const trimmed = query.trim();
      if (!trimmed) {
        setMessage('أدخل نصاً للبحث عن أسئلة مشابهة.');
        return;
      }
      const confirmed = window.confirm(`حذف كل سؤال يحتوي على: «${trimmed}»؟`);
      if (!confirmed) return;

      const res = await fetch('/api/admin/delete-similar-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { deletedCount?: number; error?: string };
      if (!res.ok) {
        setMessage(data.error || 'فشل حذف الأسئلة المشابهة.');
        return;
      }
      setMessage(`تم حذف ${data.deletedCount ?? 0} سؤالاً يحتوي على «${trimmed}».`);
      window.location.reload();
    });
  }

  return (
    <div className={pageStyles.cleanupBar}>
      <Button type="button" variant="destructive" disabled={pending} onClick={cleanOddQuestions}>
        تنظيف الأسئلة الشاذة
      </Button>
      <Input
        label="نص مشابه للحذف"
        name="query"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="جزء من نص السؤال"
      />
      <Button type="button" variant="destructive" disabled={pending} onClick={deleteSimilar}>
        حذف المشابه
      </Button>
      {message ? (
        <p role="status" className={pageStyles.cleanupStatus}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
