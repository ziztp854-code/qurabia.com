import { useState } from 'react';
import { Check, Eye, FastForward, RefreshCw, X } from 'lucide-react';
import type { HistoryResult, LetterQuestion } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

export function QuestionPanel({
  question,
  onJudge,
  onReplace,
  canReplace,
}: {
  question: LetterQuestion | null;
  onJudge: (result: HistoryResult) => void;
  onReplace: () => void;
  canReplace: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <section
      id="letter-question-panel"
      className={styles.questionPanel}
      tabIndex={-1}
      aria-labelledby="active-question-title"
    >
      <div className={styles.questionBody}>
        <h2 id="active-question-title">{question?.prompt ?? 'اختر حرفًا من اللوحة'}</h2>
        {question && (
          <div className={styles.answer} role="status" aria-live="polite">
            {revealed ? (
              <>
                <span>الجواب</span> <strong>{question.answer}</strong>
              </>
            ) : null}
          </div>
        )}
      </div>
      {question && (
        <div className={styles.questionControls}>
          <div className={styles.questionUtilities}>
            <button
              className={styles.revealControl}
              type="button"
              onClick={(event) => {
                setRevealed(true);
                event.currentTarget.focus({ preventScroll: true });
              }}
              aria-pressed={revealed}
            >
              <Eye aria-hidden="true" />
              كشف الجواب
            </button>
            {canReplace && (
              <button className={styles.secondaryControl} type="button" onClick={onReplace}>
                <RefreshCw aria-hidden="true" />
                تغيير السؤال
              </button>
            )}
          </div>
          <div className={styles.judgeActions} role="group" aria-label="حكم الإجابة">
            <button
              type="button"
              data-action="correct"
              aria-label="إجابة صحيحة"
              onClick={() => onJudge('correct')}
            >
              <Check aria-hidden="true" />
              صحيحة
            </button>
            <button
              type="button"
              data-action="wrong"
              aria-label="إجابة خاطئة"
              onClick={() => onJudge('wrong')}
            >
              <X aria-hidden="true" />
              خاطئة
            </button>
            <button
              type="button"
              data-action="skip"
              aria-label="تجاوز السؤال"
              onClick={() => onJudge('skipped')}
            >
              <FastForward aria-hidden="true" />
              تجاوز
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
