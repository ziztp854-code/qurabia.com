'use client';

import { Check, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import {
  addQuestionToQuizDraft,
  isQuestionInQuizDraft,
  type QuizDraftQuestion,
} from '@/lib/quizzes/quiz-draft';

export function AddQuestionToQuizButton({ question }: { question: QuizDraftQuestion }) {
  // React 19 "store information from previous renders" idiom: when the parent
  // re-renders with a different question we re-check the external quiz-draft
  // store during render itself. This sidesteps both `set-state-in-effect`
  // and `refs-during-render` while keeping the displayed `added` state in
  // sync with whatever the user has in their draft.
  const [added, setAdded] = useState(() => isQuestionInQuizDraft(question.id));
  const [prevQuestionId, setPrevQuestionId] = useState(question.id);
  if (prevQuestionId !== question.id) {
    setPrevQuestionId(question.id);
    setAdded(isQuestionInQuizDraft(question.id));
  }
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(() => {
      const result = addQuestionToQuizDraft(question);
      if (result.status === 'added') {
        setAdded(true);
        setMessage(`أُضيف إلى مسودة المسابقة (${result.count})`);
        return;
      }
      if (result.status === 'exists') {
        setAdded(true);
        setMessage('السؤال موجود مسبقاً في مسودة المسابقة');
        return;
      }
      setMessage(result.message);
    });
  }

  return (
    <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'start' }}>
      <Button
        type="button"
        size="sm"
        variant={added ? 'outline' : 'secondary'}
        disabled={pending || added}
        onClick={handleAdd}
        aria-label={added ? 'مضاف إلى المسابقة' : 'إضافة السؤال إلى المسابقة'}
      >
        {added ? <Check /> : <Plus />}
        {added ? 'مضاف' : 'إضافة'}
      </Button>
      {message ? (
        <small style={{ opacity: 0.85, maxWidth: '12rem', lineHeight: 1.35 }}>
          {message}{' '}
          <Link href="/quizzes/new" style={{ textDecoration: 'underline' }}>
            فتح المسابقة
          </Link>
        </small>
      ) : null}
    </div>
  );
}
