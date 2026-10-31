'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Timer, ShieldCheck } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { LadderQuestion } from '@tahaddi/domain';
import styles from './ladder-room.module.css';

type QuestionDisplayProps = {
  question: LadderQuestion;
  timeLimit: number;
  roundNumber: number;
  totalRounds: number;
  onAnswer: (optionId: string) => void;
  selectedOption: string | null;
  disabled: boolean;
  correctOptionId?: string;
};

export function QuestionDisplay({
  question,
  timeLimit,
  roundNumber,
  totalRounds,
  onAnswer,
  selectedOption,
  disabled,
  correctOptionId,
}: QuestionDisplayProps) {
  // A periodic room snapshot can update remaining time without starting a new question.
  const resetKey = question.id;

  return (
    <QuestionDisplayBody
      key={resetKey}
      question={question}
      timeLimit={timeLimit}
      roundNumber={roundNumber}
      totalRounds={totalRounds}
      onAnswer={onAnswer}
      selectedOption={selectedOption}
      disabled={disabled}
      correctOptionId={correctOptionId}
    />
  );
}

type QuestionDisplayBodyProps = QuestionDisplayProps;

function QuestionDisplayBody({
  question,
  timeLimit,
  roundNumber,
  totalRounds,
  onAnswer,
  selectedOption,
  disabled,
  correctOptionId,
}: QuestionDisplayBodyProps) {
  // The server snapshot provides remaining seconds; the monotonic clock avoids
  // premature expiry when the device clock is misconfigured.
  const remainingMs = timeLimit * 1000;
  const deadline = useRef(0);
  const [initialTimeLimit] = useState(timeLimit);
  const [seconds, setSeconds] = useState(timeLimit);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    deadline.current = performance.now() + remainingMs;
    const timer = window.setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)));
    }, 250);
    return () => window.clearInterval(timer);
  }, [remainingMs]);

  const handleAnswer = (optionId: string) => {
    if (selectedOption !== null || disabled || seconds <= 0) return;
    onAnswer(optionId);
  };

  const optionLabels = ['أ', 'ب', 'ج', 'د'] as const;
  const timerEnding = seconds <= 5;
  const timerWarning = seconds <= 10 && seconds > 5;
  const fillScale = initialTimeLimit > 0 ? Math.min(1, seconds / initialTimeLimit) : 0;
  const timerLabelId = `ladder-timer-${question.id}`;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={styles.ladderQuestionCard}
    >
      <div className={styles.questionHeader}>
        <span className={styles.ladderCategory}>
          السؤال {formatNumber(roundNumber)} من {formatNumber(totalRounds)} · {question.category.name} · {question.difficulty === 'EASY' ? 'سهل' : question.difficulty === 'MEDIUM' ? 'متوسط' : 'صعب'}
        </span>
        <div
          className={styles.timerPill}
          role="timer"
          aria-live="off"
          aria-atomic="true"
          aria-labelledby={timerLabelId}
        >
          <Timer aria-hidden="true" className={styles.timerIcon} />
          <span id={timerLabelId} aria-label={`${formatNumber(seconds)} ثانية`}>{formatNumber(seconds)}</span>
        </div>
        <div className={styles.timerTrack} aria-hidden="true">
          <div
            className={styles.timerFill}
            data-ending={timerEnding || undefined}
            data-warning={timerWarning || undefined}
            style={{ transform: `scaleX(${fillScale})` }}
          />
        </div>
      </div>

      <h2 className={styles.ladderPrompt} data-long={question.questionText.length > 90 || undefined}>{question.questionText}</h2>

      <div className={styles.ladderOptions}>
        {question.options.map((option, index) => {
          const isChosen = selectedOption === option.id;
          return (
            <motion.button
              key={option.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: index * 0.08 }}
              type="button"
              className={styles.ladderOption}
              data-long={option.text.length > 30 || undefined}
              disabled={selectedOption !== null || disabled || seconds <= 0 || Boolean(correctOptionId)}
              data-correct={correctOptionId === option.id || undefined}
              data-wrong={Boolean(correctOptionId && isChosen && correctOptionId !== option.id) || undefined}
              aria-pressed={isChosen}
              onClick={() => handleAnswer(option.id)}
            >
              <span className={styles.ladderOptionIndex}>{optionLabels[index]}</span>
              <span>{option.text}</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {selectedOption !== null && !correctOptionId && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className={styles.ladderReveal}
            role="status"
            aria-live="polite"
          >
            <p className={styles.revealLine}>
              <ShieldCheck aria-hidden="true" className={styles.revealIconSuccess} />
              <span>تم إرسال الإجابة.</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
