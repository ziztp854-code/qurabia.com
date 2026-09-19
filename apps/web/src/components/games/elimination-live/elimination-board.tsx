'use client';

import type { EliminationDifficulty } from '@tahaddi/contracts';
import './elimination-board.css';

const OPTION_LETTERS = ['أ', 'ب', 'ج', 'د'] as const;
const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

const DIFFICULTY_LABELS: Record<EliminationDifficulty, string> = {
  EASY: 'مبتدئ',
  MEDIUM: 'متوسط',
  HARD: 'متقدّم',
};

export function eliminationDifficultyLabel(difficulty: EliminationDifficulty) {
  return DIFFICULTY_LABELS[difficulty];
}

export function formatRemainingClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export type EliminationQuestionView = {
  id: string;
  prompt: string;
  options: string[];
  difficulty: EliminationDifficulty;
  roundNumber: number;
  timeLimit: number;
};

export type EliminationBoardProps = {
  question: EliminationQuestionView;
  myAnswer: number | null;
  revealedCorrectIndex: number | null;
  aliveCount: number;
  roundLabel: string;
  timeLabel: string;
  disabled: boolean;
  onSelectOption: (optionIndex: number) => void;
  /** 0..1 نسبة الوقت المتبقي، تُغذي حلقة المؤقت. */
  timerRatio?: number | null;
};

const TIMER_CIRCUMFERENCE = 2 * Math.PI * 26;

export function EliminationBoard({
  question,
  myAnswer,
  revealedCorrectIndex,
  aliveCount,
  roundLabel,
  timeLabel,
  disabled,
  onSelectOption,
  timerRatio = null,
}: EliminationBoardProps) {
  const settled = myAnswer != null || revealedCorrectIndex != null;
  const ratio =
    timerRatio == null
      ? 1
      : Math.max(0, Math.min(1, timerRatio));
  const timerZone =
    ratio > 0.5 ? 'safe' : ratio > 0.22 ? 'warn' : 'danger';
  const timerSeconds = Math.max(
    0,
    Math.round((timerRatio ?? 1) * question.timeLimit),
  );

  const stateFor = (index: number) => {
    if (revealedCorrectIndex != null) {
      if (index === revealedCorrectIndex) return 'correct';
      if (index === myAnswer) return 'wrong';
      return 'disabled';
    }
    if (index === myAnswer) return 'selected';
    if (disabled) return 'disabled';
    return 'default';
  };

  return (
    <section
      className={`el-board zone-${question.difficulty.toLowerCase()}`}
      data-difficulty={question.difficulty.toLowerCase()}
      aria-label={`سؤال الجولة ${question.roundNumber}`}
    >
      <header className="el-board-head">
        <div className="el-head-chips">
          <span className="el-badge">{roundLabel}</span>
          <span className="el-diff-pill">
            الصعوبة: {eliminationDifficultyLabel(question.difficulty)}
          </span>
          <span className="el-alive">
            <strong>{aliveCount}</strong> في الحلقة
          </span>
        </div>
        <div
          className={`el-timer zone-${timerZone}`}
          role="timer"
          aria-label={`الوقت المتبقي ${timeLabel}`}
          data-urgent={timerZone === 'danger' || undefined}
        >
          <svg viewBox="0 0 60 60" aria-hidden="true">
            <circle className="el-timer-track" cx="30" cy="30" r="26" />
            <circle
              className="el-timer-arc"
              cx="30"
              cy="30"
              r="26"
              strokeDasharray={TIMER_CIRCUMFERENCE}
              strokeDashoffset={TIMER_CIRCUMFERENCE * (1 - ratio)}
            />
          </svg>
          <span className="el-timer-val num">{timerSeconds}</span>
        </div>
      </header>

      <article className="el-question-card">
        <h2 className="el-question-text">{question.prompt}</h2>
        <p className="el-question-hint">
          الإجابة الخاطئة أو نفاد الوقت يعني الإقصاء — اختر بثقة.
        </p>

        <div className="el-options" role="group" aria-label="خيارات الإجابة">
          {question.options.map((option, index) => {
            const state = stateFor(index);
            return (
              <button
                key={`${question.id}-${index}`}
                type="button"
                className={`el-option el-option-${OPTION_KEYS[index]} is-${state}`}
                data-option-key={OPTION_KEYS[index]}
                disabled={disabled || settled}
                aria-pressed={state === 'selected'}
                onClick={() => onSelectOption(index)}
              >
                <span className="el-option-letter" aria-hidden="true">
                  {OPTION_LETTERS[index]}
                </span>
                <span className="el-option-text">{option}</span>
                <span className="el-option-mark" aria-hidden="true">
                  {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : ''}
                </span>
              </button>
            );
          })}
        </div>

        {myAnswer != null && revealedCorrectIndex == null && (
          <p className="el-answer-note" role="status">
            قُيّدت إجابتك — بانتظار حسم الجولة
          </p>
        )}
      </article>
    </section>
  );
}
