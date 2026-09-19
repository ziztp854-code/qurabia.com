'use client';
import { formatNumber } from '@/lib/utils';

import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui';
import { QUIZ_DRAFT_CHANGED_EVENT, QUIZ_DRAFT_STORAGE_KEY, readQuizDraft } from '@/lib/quizzes/quiz-draft';
import pageStyles from './question-bank-page.module.css';

export function QuizDraftTray() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      try {
        setCount(readQuizDraft().questions.length);
      } catch {
        setCount(0);
      }
    };
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === QUIZ_DRAFT_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    window.addEventListener(QUIZ_DRAFT_CHANGED_EVENT, refresh);
    const interval = window.setInterval(refresh, 1500);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(QUIZ_DRAFT_CHANGED_EVENT, refresh);
      window.clearInterval(interval);
    };
  }, []);

  if (count === 0) return null;

  return (
    <div className={pageStyles.draftTray}>
      <span className={pageStyles.draftTrayLabel}>
        <ClipboardList size={18} aria-hidden="true" />
        مسودة المسابقة: {formatNumber(count)} سؤال جاهز للبدء
      </span>
      <ButtonLink href="/quizzes/new" size="sm" variant="gold">
        متابعة بناء المسابقة
      </ButtonLink>
      <Link href="/quizzes/new" className="sr-only">
        فتح منشئ المسابقة
      </Link>
    </div>
  );
}
