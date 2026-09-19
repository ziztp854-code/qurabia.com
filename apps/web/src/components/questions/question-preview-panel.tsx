'use client';
import { formatNumber } from '@/lib/utils';

import { AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';

export type PreviewIssue = {
  level: 'error' | 'warning';
  path: string;
  message: string;
};

export type PreviewDuplicates = Array<{
  id: string;
  prompt: string;
}>;

type PreviewResponse = {
  ok: true;
  normalized: {
    prompt: string;
    options: string[];
    correctOption: number;
    expectedAnswer: string | null;
    keywords: string[];
  };
  issues: PreviewIssue[];
  duplicates: PreviewDuplicates;
  hasErrors: boolean;
};

type PreviewError = { ok: false; message: string };

export function QuestionPreviewPanel({
  defaultPrompt = '',
  defaultOptions = [] as string[],
  defaultCorrectOption = 0,
  defaultExpectedAnswer = '',
  defaultKeywords = [] as string[],
  defaultDifficulty = 'MEDIUM',
  defaultType = 'MULTIPLE_CHOICE',
  defaultCategoryId = '' as string | null,
  defaultTimeLimit = 20,
  defaultBasePoints = 1000,
  defaultGameTypes = ['QUIZ', 'LADDER'],
  categoryName,
}: {
  defaultPrompt?: string;
  defaultOptions?: string[];
  defaultCorrectOption?: number;
  defaultExpectedAnswer?: string;
  defaultKeywords?: string[];
  defaultDifficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  defaultType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  defaultCategoryId?: string | null;
  defaultTimeLimit?: number;
  defaultBasePoints?: number;
  defaultGameTypes?: Array<
    'QUIZ' | 'LADDER' | 'CATEGORY_BOARD' | 'LETTER_CHALLENGE' | 'MILLIONAIRE'
  >;
  categoryName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/admin/questions/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: defaultType,
            prompt: defaultPrompt,
            options: defaultType === 'TRUE_FALSE' ? ['صح', 'خطأ'] : defaultOptions,
            correctOption: defaultCorrectOption,
            expectedAnswer: defaultExpectedAnswer || null,
            difficulty: defaultDifficulty,
            categoryId: defaultCategoryId || null,
            timeLimit: defaultTimeLimit,
            basePoints: defaultBasePoints,
            gameTypes: defaultGameTypes,
            keywords: defaultKeywords,
          }),
        });
        const data = (await response.json().catch(() => null)) as PreviewResponse | PreviewError | null;
        if (!data) {
          setError('فشل الاتصال بالخادم.');
          return;
        }
        if (!('ok' in data) || !data.ok) {
          setError('message' in data ? data.message : 'فشل التحقق.');
          return;
        }
        setResult(data);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'فشل التحقق.');
      }
    });
  };

  return (
    <section className="question-preview-panel" aria-labelledby="preview-title">
      <header className="question-preview-header">
        <h3 id="preview-title">
          <Sparkles aria-hidden /> معاينة قبل الحفظ
        </h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={run} disabled={pending}>
          {pending ? 'جاري التحقق...' : 'تحقق الآن'}
        </button>
      </header>

      {error && (
        <div className="preview-feedback preview-error" role="alert">
          {error}
        </div>
      )}

      {!error && !result && (
        <p className="preview-hint">
          اضغط «تحقق الآن» لتقييم السؤال بدون حفظه: يطابق قواعد النوع، يفحص الكلمات المفتاحية، ويبحث عن تكرار في نفس الفئة.
          {categoryName ? <strong> الفئة الحالية: {categoryName}.</strong> : null}
        </p>
      )}

      {result && (
        <div className="preview-body">
          <div className={`preview-summary ${result.hasErrors ? 'has-errors' : 'is-clean'}`}>
            {result.hasErrors ? (
              <>
                <AlertCircle aria-hidden /> {formatNumber(result.issues.filter((issue) => issue.level === 'error').length)} أخطاء تمنع النشر
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden /> لا توجد أخطاء حرجة
              </>
            )}
          </div>

          {result.issues.length > 0 && (
            <ul className="preview-issues">
              {result.issues.map((issue, index) => (
                <li key={index} className={`preview-issue preview-issue-${issue.level}`}>
                  <strong>{issue.path}:</strong> {issue.message}
                </li>
              ))}
            </ul>
          )}

          {result.duplicates.length > 0 && (
            <div className="preview-duplicates">
              <h4>أسئلة مشابهة في نفس الفئة</h4>
              <ul>
                {result.duplicates.map((dup) => (
                  <li key={dup.id}>{dup.prompt}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="preview-normalized">
            <h4>البيانات بعد التطبيع</h4>
            <dl>
              <dt>الكلمات المفتاحية</dt>
              <dd>{result.normalized.keywords.length === 0 ? '—' : result.normalized.keywords.join('، ')}</dd>
              <dt>الخيارات</dt>
              <dd>
                {result.normalized.options.length === 0
                  ? '—'
                  : result.normalized.options.map((opt, idx) => (
                      <span key={idx} className={idx === result.normalized.correctOption ? 'is-correct' : ''}>
                        {idx === result.normalized.correctOption ? '✓ ' : ''}
                        {opt}
                      </span>
                    ))}
              </dd>
              {result.normalized.expectedAnswer && (
                <>
                  <dt>الإجابة المتوقعة</dt>
                  <dd>{result.normalized.expectedAnswer}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
