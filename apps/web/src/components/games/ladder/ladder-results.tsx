'use client';

import type { LadderRoundAnswer, LadderRoundResult } from '@tahaddi/domain';
import { formatNumber } from '@/lib/utils';
import styles from './ladder-results.module.css';

type Props = {
  results: LadderRoundResult[];
  rightName?: string;
  leftName?: string;
};

function Answer({ answer, options }: { answer: LadderRoundAnswer; options: Array<{ id: string; text: string }> }) {
  const text = options.find((option) => option.id === answer.optionId)?.text;
  return (
    <div className={styles.answer}>
      <strong>{answer.optionId === null ? 'لم يجب' : answer.correct ? 'إجابة صحيحة' : 'إجابة خاطئة'}</strong>
      <span>{text ?? (answer.optionId === null ? 'انتهى الوقت' : '—')}</span>
      <span>{answer.elapsedMs === null ? 'الوقت: —' : `الوقت: ${(answer.elapsedMs / 1000).toFixed(1)} ثانية`}</span>
      <span>النقاط: {formatNumber(answer.points)}</span>
    </div>
  );
}

export function LadderResults({ results, rightName = 'المتسابق الأيمن', leftName = 'المتسابق الأيسر' }: Props) {
  return (
    <section className={styles.results} aria-label="ملخص الإجابات">
      <h3>{results.length === 1 ? 'نتيجة السؤال' : 'ملخص الإجابات والسرعة'}</h3>
      {results.map((result) => (
        <article className={styles.round} key={result.questionId}>
          <p><strong>السؤال {formatNumber(result.roundNumber)}:</strong> {result.questionText}</p>
          <p>الإجابة الصحيحة: {result.options.find((option) => option.id === result.correctOptionId)?.text ?? '—'}</p>
          <div className={styles.players}>
            <div><h4>{rightName}</h4><Answer answer={result.right} options={result.options} /></div>
            <div><h4>{leftName}</h4><Answer answer={result.left} options={result.options} /></div>
          </div>
        </article>
      ))}
    </section>
  );
}
