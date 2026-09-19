'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Timer, ShieldCheck } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import type { LadderQuestion } from '@tahaddi/domain';
import styles from './ladder-room.module.css';

type Phase = 'question' | 'reveal';

type QuestionDisplayProps = {
  question: LadderQuestion;
  timeLimit: number;
  roundNumber: number;
  totalRounds: number;
  onAnswer: (optionId: string) => void;
  selectedOption: string | null;
  disabled: boolean;
};

export function QuestionDisplay({
  question,
  timeLimit,
  roundNumber,
  totalRounds,
  onAnswer,
  selectedOption,
  disabled,
}: QuestionDisplayProps) {
  // Use a stable derived key so a new question/time-limit remounts the
  // inner state cleanly without firing cascading setState calls inside
  // useEffect (forbidden by react-hooks/set-state-in-effect).
  const resetKey = `${question.id}:${timeLimit}`;

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
  selectedOption: serverSelectedOption,
  disabled,
}: QuestionDisplayBodyProps) {
  const [seconds, setSeconds] = useState(timeLimit);
  const [phase, setPhase] = useState<Phase>('question');
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (phase !== 'question') return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    timerRef.current = timer;
    return () => {
      window.clearInterval(timer);
      timerRef.current = null;
    };
  }, [phase, question.id]);

  // When the server-driven reveal arrives (e.g. another player answered
  // first) promote the local phase + selection so the UI stays in sync
  // with the room state.
  const serverRevealed = serverSelectedOption !== null;
  const effectiveSelected = serverRevealed ? serverSelectedOption : localSelected;
  const effectivePhase: Phase = serverRevealed ? 'reveal' : phase;

  const handleAnswer = (optionId: string) => {
    if (phase !== 'question' || disabled) return;
    setLocalSelected(optionId);
    setPhase('reveal');
    onAnswer(optionId);
  };

  const optionLabels = ['أ', 'ب', 'ج', 'د'] as const;
  const timerEnding = seconds <= 5;
  const timerWarning = seconds <= 10 && seconds > 5;
  const fillScale = timeLimit > 0 ? Math.max(0, seconds / timeLimit) : 0;
  const timerLabelId = `ladder-timer-${question.id}`;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={styles.ladderQuestionCard}
    >
      <div className={styles.questionHeader}>
        <span className={styles.ladderCategory}>
          الجولة {formatNumber(roundNumber)} من {formatNumber(totalRounds)}
        </span>
        <div
          className={styles.timerPill}
          role="timer"
          aria-live={timerEnding ? 'assertive' : 'polite'}
          aria-atomic="true"
          aria-labelledby={timerLabelId}
        >
          <Timer aria-hidden="true" className={styles.timerIcon} />
          <span id={timerLabelId}>{formatNumber(seconds)} ثانية</span>
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

      <h2 className={styles.ladderPrompt}>{question.questionText}</h2>

      <div className={styles.ladderOptions}>
        {question.options.map((option, index) => {
          const isChosen = effectiveSelected === option.id;
          return (
            <motion.button
              key={option.id}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0 } : { delay: index * 0.08 }}
              type="button"
              className={styles.ladderOption}
              disabled={effectivePhase !== 'question' || disabled}
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
        {effectivePhase === 'reveal' && (
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
