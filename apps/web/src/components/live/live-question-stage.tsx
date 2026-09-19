'use client';
import { formatNumber } from '@/lib/utils';
import { getGameMotionScene } from '@/lib/motion';
import { MotionScene } from '@/components/motion/motion-scene';

import { useEffect, useMemo, useState } from 'react';
import type {
  GamePhase,
  QuestionPayload,
  QuestionRevealPayload,
  QuestionStatsPayload,
} from '@tahaddi/contracts';
import { getQuestionRemainingMs } from '@tahaddi/contracts';
import { Check, Info, X } from 'lucide-react';

const optionVisuals = [
  { symbol: 'أ', className: 'royal-option-1', label: 'الخيار أ' },
  { symbol: 'ب', className: 'royal-option-2', label: 'الخيار ب' },
  { symbol: 'ج', className: 'royal-option-3', label: 'الخيار ج' },
  { symbol: 'د', className: 'royal-option-4', label: 'الخيار د' },
] as const;

export function LiveCountdown({
  question,
  clockOffset,
}: {
  question: QuestionPayload;
  clockOffset: number;
}) {
  const duration = Math.max(1, question.questionEndsAt - question.questionStartedAt);
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    const update = () => setRemaining(getQuestionRemainingMs(question.questionEndsAt, clockOffset));
    update();
    const timer = window.setInterval(update, 100);
    return () => window.clearInterval(timer);
  }, [clockOffset, question.questionEndsAt]);

  const seconds = Math.ceil(remaining / 1_000);
  const progress = Math.max(0, Math.min(1, remaining / duration));

  return (
    <div
      className={`royal-timer${seconds <= 2 ? ' is-critical' : seconds <= 5 ? ' is-warning' : ''}`}
      style={{ '--timer-progress': progress } as React.CSSProperties}
      role="timer"
      aria-label={`متبقي ${formatNumber(seconds)} ثانية`}
    >
      <span className="royal-timer-aura" aria-hidden="true" />
      <strong>{formatNumber(seconds)}</strong>
      <span className="royal-timer-unit">ثانية</span>
    </div>
  );
}

function QuestionMedia({ question }: { question: QuestionPayload }) {
  if (question.media.length === 0) {
    return null;
  }
  return (
    <div className="royal-question-media">
      {question.media.slice(0, 2).map((media) =>
        media.type === 'video' ? (
          <video key={media.url} src={media.url} controls preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={media.url} src={media.url} alt={media.alt ?? 'وسائط السؤال'} />
        ),
      )}
    </div>
  );
}

export function LiveQuestionStage({
  question,
  phase,
  reveal,
  stats,
  clockOffset,
  selectedOptionId,
  onSelect,
  disabled = false,
  hostCorrectOptionId,
  className = '',
  showProgressLabel = true,
  category,
  points,
}: {
  question: QuestionPayload;
  phase: GamePhase;
  reveal: QuestionRevealPayload | null;
  stats: QuestionStatsPayload | null;
  clockOffset: number;
  selectedOptionId?: string;
  onSelect?: (optionId: string) => void;
  disabled?: boolean;
  hostCorrectOptionId?: string;
  className?: string;
  showProgressLabel?: boolean;
  category?: string;
  points?: number;
}) {
  const statsByOption = useMemo(
    () => new Map(stats?.options.map((item) => [item.optionId, item]) ?? []),
    [stats],
  );
  const slots = Array.from({ length: 4 }, (_, index) => question.options[index] ?? null);

  return (
    <MotionScene scene={getGameMotionScene(phase)} sceneKey={`${question.questionId}:${phase}`}>
      <section
        className={`royal-question-stage ${className}`.trim()}
        aria-live="polite"
        data-phase={phase}
      >
      <div className="royal-question-card">
        <div className="royal-question-copy">
          {showProgressLabel && (
            <span className="royal-question-progress">
              السؤال {formatNumber(question.questionNumber)} من{' '}
              {formatNumber(question.totalQuestions)}
            </span>
          )}
          <h2>{question.prompt}</h2>
          {(category !== undefined || points !== undefined) && (
            <div className="royal-question-chips">
              {category && <span className="royal-question-chip">{category}</span>}
              {points !== undefined && (
                <span className="royal-question-chip is-points">{formatNumber(points)} نقطة</span>
              )}
            </div>
          )}
        </div>
      </div>

      <QuestionMedia question={question} />

      {phase === 'QUESTION' && <LiveCountdown question={question} clockOffset={clockOffset} />}

      {phase === 'REVEAL' && reveal?.explanation && (
        <aside className="royal-reveal-explanation">
          <span className="royal-reveal-explanation-icon" aria-hidden="true">
            <Info />
          </span>
          <div>
            <strong>التوضيح</strong>
            <p>{reveal.explanation}</p>
          </div>
        </aside>
      )}

      {question.options.length === 0 ? (
        <aside className="royal-reveal-explanation" role="note">
          <span className="royal-reveal-explanation-icon" aria-hidden="true">
            <Info />
          </span>
          <div>
            <strong>سؤال بلا خيارات</strong>
            <p>لم تُضف خيارات إجابة لهذا السؤال بعد، ولا يمكن الإجابة عليه في الوضع المباشر.</p>
          </div>
        </aside>
      ) : (
        <div
          className={`royal-question-grid${slots.filter(Boolean).length === 2 ? ' is-binary' : ''}`}
          role="group"
          aria-label="خيارات الإجابة"
        >
          {slots.map((option, index) => {
            const visual = optionVisuals[index] ?? optionVisuals[0];
            if (!option) {
              return <span className="royal-answer-placeholder" key={`empty-${index}`} />;
            }
            const optionStats = statsByOption.get(option.id);
            const correct = reveal?.correctOptionId === option.id;
            const selected = selectedOptionId === option.id;
            const revealedIncorrect = Boolean(reveal && !correct);
            const wrong = Boolean(revealedIncorrect && (selected || !onSelect));
            const hostCorrect = !reveal && hostCorrectOptionId === option.id;
            const share = Math.max(0, Math.min(100, optionStats?.percentage ?? 0));
            return (
              <button
                type="button"
                key={option.id}
                className={`royal-answer-option ${visual.className} ${
                  correct
                    ? 'is-correct'
                    : wrong
                      ? 'is-wrong'
                      : revealedIncorrect
                        ? 'is-revealed-incorrect'
                        : ''
                } ${selected ? 'is-selected' : ''} ${hostCorrect ? 'is-host-correct' : ''}`}
                onClick={() => onSelect?.(option.id)}
                disabled={disabled || phase !== 'QUESTION' || !onSelect}
                aria-pressed={selected}
                aria-label={`${visual.label}: ${option.text}`}
              >
                <span className="royal-answer-number" aria-hidden="true">
                  {visual.symbol}
                </span>
                <span className="royal-answer-copy">{option.text}</span>
                {hostCorrect && (
                  <span className="royal-host-correct-label" aria-label="الإجابة الصحيحة للمضيف">
                    <Check aria-hidden="true" /> الإجابة الصحيحة
                  </span>
                )}
                {reveal && (
                  <span className="royal-answer-result" aria-label={correct ? 'صحيحة' : 'خاطئة'}>
                    <strong aria-hidden="true">{correct ? <Check /> : <X />}</strong>
                    <small>
                      {formatNumber(optionStats?.count ?? 0)} ·{' '}
                      {formatNumber(optionStats?.percentage ?? 0)}٪
                    </small>
                  </span>
                )}
                {optionStats && (
                  <span
                    className="royal-answer-share"
                    style={{ '--answer-share': `${share}%` } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    <i />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      </section>
    </MotionScene>
  );
}
