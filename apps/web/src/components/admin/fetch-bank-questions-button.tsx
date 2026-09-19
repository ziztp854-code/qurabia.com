'use client';

import { Check, ListPlus } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import {
  addQuestionToQuizDraft,
  type QuizDraftQuestion,
} from '@/lib/quizzes/quiz-draft';
import {
  fetchBankQuestions,
} from '@/app/admin/(console)/content/fetch-questions';

const FETCH_QUESTIONS_COUNT = 20;

export type FetchBankQuestionsFilters = {
  category: string;
  q: string;
  difficulty: string;
  game: string;
  time: string;
  includeDescendants?: boolean;
};

export function FetchBankQuestionsButton({ filters }: { filters: FetchBankQuestionsFilters }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await fetchBankQuestions({
        category: filters.category,
        q: filters.q,
        difficulty: filters.difficulty,
        game: filters.game,
        time: filters.time,
        includeDescendants: filters.includeDescendants,
      });
      if (result.status === 'error') {
        setMessage(result.message);
        return;
      }
      let addedCount = 0;
      let existsCount = 0;
      let draftFull = false;
      for (const question of result.questions) {
        const outcome = addQuestionToQuizDraft(question as QuizDraftQuestion);
        if (outcome.status === 'added') {
          addedCount += 1;
          continue;
        }
        if (outcome.status === 'exists') {
          existsCount += 1;
          continue;
        }
        draftFull = true;
        break;
      }
      if (draftFull) {
        setAdded(addedCount > 0);
        setMessage(`أُضيف ${addedCount} قبل امتلاء المسودة (الحد 100 سؤال).`);
        return;
      }
      setAdded(addedCount > 0);
      const parts: string[] = [];
      if (addedCount > 0) parts.push(`أُضيف ${addedCount}`);
      if (existsCount > 0) parts.push(`${existsCount} مكرر في المسودة`);
      setMessage(
        parts.length > 0
          ? `جُلب ${result.questions.length} سؤالًا: ${parts.join('، ')}.`
          : `جُلب ${result.questions.length} سؤالًا بلا إضافات جديدة.`,
      );
    });
  }

  return (
    <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'start' }}>
      <Button type="button" variant={added ? 'outline' : 'secondary'} disabled={pending} onClick={handleClick}>
        {added ? <Check aria-hidden="true" /> : <ListPlus aria-hidden="true" />}
        {pending ? 'جارٍ الجلب…' : `جلب ${FETCH_QUESTIONS_COUNT} سؤالًا`}
      </Button>
      {message ? (
        <small style={{ opacity: 0.85, maxWidth: '14rem', lineHeight: 1.35 }}>
          {message}{' '}
          <Link href="/quizzes/new" style={{ textDecoration: 'underline' }}>
            فتح المسابقة
          </Link>
        </small>
      ) : null}
    </div>
  );
}
