import { useState, type CSSProperties } from 'react';
import { Check, CircleHelp, Eye, EyeOff, FastForward, X } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { HistoryResult, LetterQuestion, TeamId } from '@/lib/letter-game/types';
import styles from './letter-game.module.css';

export function QuestionPanel({
  question,
  timer,
  team,
  feedback,
  onJudge,
}: {
  question: LetterQuestion | null;
  timer: number;
  team: TeamId;
  feedback: HistoryResult | null;
  onJudge: (result: 'correct' | 'wrong' | 'skipped') => void;
}) {
  const [isHostRevealRequested, setIsHostRevealRequested] = useState(false);

  if (!question) {
    return (
      <section
        id="letter-question-panel"
        className={styles.questionPanel}
        data-empty="true"
        tabIndex={-1}
        aria-live="polite"
      >
        <CircleHelp aria-hidden="true" className={styles.emptyIcon} />
        <span>اختر حرفًا من اللوحة</span>
        <h2>السؤال سيظهر هنا</h2>
        <p>يبدأ جواب كل سؤال بالحرف الذي تختاره. احكم على الإجابة ثم ينتقل الدور.</p>
      </section>
    );
  }

  // The host can reveal the answer early to judge an oral response.
  // It is also revealed automatically when time elapses or the result is locked in.
  const isAnswerRevealed =
    timer <= 0 || feedback !== null || isHostRevealRequested;
  const isTimerLow = timer > 0 && timer <= 10;

  return (
    <section
      id="letter-question-panel"
      className={styles.questionPanel}
      data-team={team}
      data-feedback={feedback ?? undefined}
      data-revealed={isAnswerRevealed ? 'true' : 'false'}
      tabIndex={-1}
      aria-labelledby="active-question-title"
    >
      <div className={styles.questionTopline}>
        <span className={styles.letterBadge}>{question.letter}</span>
        <div
          className={styles.timer}
          role="timer"
          aria-live="off"
          aria-label={`متبقي ${formatNumber(timer)} ثانية`}
          data-low={isTimerLow ? 'true' : undefined}
          data-elapsed={timer <= 0 ? 'true' : undefined}
          style={{ '--timer-angle': `${Math.max(0, (timer / 15) * 360)}deg` } as CSSProperties}
        >
          <strong>{formatNumber(Math.max(0, timer))}</strong>
          <small>ثانية</small>
        </div>
      </div>
      <span className={styles.questionLabel}>السؤال</span>
      <h2 id="active-question-title">{question.prompt}</h2>

      <div
        className={styles.answerSlot}
        data-revealed={isAnswerRevealed ? 'true' : 'false'}
        aria-live="polite"
      >
        {isAnswerRevealed ? (
          <p className={styles.hostAnswer}>
            <span className={styles.answerLabel}>الإجابة:</span>
            <span className={styles.answerValue}>{question.answer}</span>
          </p>
        ) : (
          <div className={styles.hiddenAnswer}>
            <p className={styles.hostAnswer} data-hidden="true">
              <span className={styles.answerLabel}>
                <EyeOff aria-hidden="true" />
                الإجابة محجوبة
              </span>
              <span className={styles.answerValue}>{'؟'.repeat(question.answer.length)}</span>
              <small className={styles.answerHint}>
                ستظهر الإجابة تلقائياً عند انتهاء العدّ التنازلي
              </small>
            </p>
            <button
              type="button"
              className={styles.answerRevealButton}
              onClick={() => setIsHostRevealRequested(true)}
            >
              <Eye aria-hidden="true" />
              إظهار الإجابة للمضيف
            </button>
          </div>
        )}
      </div>

      <div className={styles.judgeActions} role="group" aria-label="حكم الإجابة">
        <button type="button" data-action="correct" onClick={() => onJudge('correct')}>
          <Check aria-hidden="true" />
          إجابة صحيحة
        </button>
        <button type="button" data-action="wrong" onClick={() => onJudge('wrong')}>
          <X aria-hidden="true" />
          إجابة خاطئة
        </button>
        <button type="button" data-action="skip" onClick={() => onJudge('skipped')}>
          <FastForward aria-hidden="true" />
          تجاوز السؤال
        </button>
      </div>

      {isAnswerRevealed ? (
        <span className={styles.revealBadge} aria-hidden="true">
          <Eye aria-hidden="true" />
          تم الكشف
        </span>
      ) : null}
    </section>
  );
}
