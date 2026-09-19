'use client';

import { useMemo, useState } from 'react';
import {
  Eraser,
  ImageOff,
  Maximize,
  Settings,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import { ProgressDots, TimerRing } from './scrambled-words-ui';
import { isSoundMuted, setSoundMuted } from './use-sound-feedback';
import styles from './scrambled-words-room.module.css';

export type ScrambledWordsPuzzleBoard = {
  id: string;
  imageUrl: string;
  fragments: string[];
  wordLengths: number[];
  roundNumber: number;
};

export type ScrambledWordsBoardProps = {
  puzzle: ScrambledWordsPuzzleBoard;
  solvedWords: string[];
  disabled: boolean;
  rejectedTick: number;
  roundLabel: string;
  timeLabel: string;
  timeFraction?: number | null;
  onSubmitWord: (word: string) => void;
};

export function buildAttemptWord(
  fragments: readonly string[],
  usedIndices: readonly number[],
): string {
  return usedIndices.map((index) => fragments[index] ?? '').join('');
}

export function remainingWordLengths(
  wordLengths: readonly number[],
  solvedWords: readonly string[],
): number[] {
  const remaining = [...wordLengths];
  for (const word of solvedWords) {
    const length = Array.from(word.replace(/\s+/g, '')).length;
    const slotIndex = remaining.indexOf(length);
    if (slotIndex !== -1) remaining.splice(slotIndex, 1);
  }
  return remaining;
}

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen?.();
  }
}

export function ScrambledWordsBoard({
  puzzle,
  solvedWords,
  disabled,
  rejectedTick,
  roundLabel,
  timeLabel,
  timeFraction,
  onSubmitWord,
}: ScrambledWordsBoardProps) {
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const [boardPuzzleId, setBoardPuzzleId] = useState(puzzle.id);
  const [seenRejectedTick, setSeenRejectedTick] = useState(rejectedTick);
  const [rejected, setRejected] = useState(false);
  const [muted, setMutedState] = useState(isSoundMuted);

  if (boardPuzzleId !== puzzle.id) {
    setBoardPuzzleId(puzzle.id);
    setUsedIndices([]);
    setRejected(false);
  }
  if (seenRejectedTick !== rejectedTick) {
    setSeenRejectedTick(rejectedTick);
    if (rejectedTick > 0) {
      setUsedIndices([]);
      setRejected(true);
      window.setTimeout(() => setRejected(false), 900);
    }
  }

  const targetLengths = useMemo(
    () => remainingWordLengths(puzzle.wordLengths, solvedWords),
    [puzzle.wordLengths, solvedWords],
  );

  const handleFragmentClick = (index: number) => {
    if (disabled || usedIndices.includes(index)) return;
    const nextIndices = [...usedIndices, index];
    setUsedIndices(nextIndices);

    const nextWord = buildAttemptWord(puzzle.fragments, nextIndices);
    const nextLength = Array.from(nextWord.replace(/\s+/g, '')).length;
    if (nextLength > 0 && targetLengths.includes(nextLength)) {
      onSubmitWord(nextWord);
    }
  };

  const handleRemoveFragment = (index: number) => {
    if (disabled) return;
    setUsedIndices((current) => current.filter((used) => used !== index));
  };

  const handleClear = () => {
    if (disabled) return;
    setUsedIndices([]);
    setRejected(false);
  };

  const toggleMute = () => {
    const next = !muted;
    setSoundMuted(next);
    setMutedState(next);
  };

  return (
    <section className={styles.swlBoard} aria-label="لوحة اللغز">
      <header className={styles.swlBoardHeader}>
        <div className={styles.swlBoardTitle}>
          <span className={styles.swlWordmark}>تحدّي</span>
          <span className={styles.swlGameName}>كلمات مفككة</span>
          <span className={styles.swlBadge}>{roundLabel}</span>
        </div>
        <div className={styles.swlHeaderTools}>
          <TimerRing fraction={timeFraction ?? null} label={timeLabel} />
          <ProgressDots total={puzzle.wordLengths.length} solved={solvedWords.length} />
          <div className={styles.swlToolButtons}>
            <button
              type="button"
              className={styles.swlToolButton}
              onClick={toggleMute}
              aria-pressed={muted}
              aria-label={muted ? 'تفعيل الصوت' : 'كتم الصوت'}
              title={muted ? 'تفعيل الصوت' : 'كتم الصوت'}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <button
              type="button"
              className={styles.swlToolButton}
              onClick={toggleFullscreen}
              aria-label="ملء الشاشة"
              title="ملء الشاشة"
            >
              <Maximize size={18} />
            </button>
            <details className={styles.swlToolMenu}>
              <summary
                className={styles.swlToolButton}
                role="button"
                aria-label="الإعدادات"
                title="الإعدادات"
              >
                <Settings size={18} />
              </summary>
              <div className={styles.swlToolMenuPanel}>
                <button type="button" onClick={toggleMute}>
                  {muted ? 'المؤثرات الصوتية: صامتة' : 'المؤثرات الصوتية: مفعّلة'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleFullscreen();
                  }}
                >
                  ملء الشاشة
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      <figure className={styles.swlHero}>
        {puzzle.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={puzzle.imageUrl}
            alt={`صورة اللغز للجولة ${formatNumber(puzzle.roundNumber)}`}
            className={styles.swlHeroImage}
            draggable={false}
          />
        ) : (
          <div className={`${styles.swlHeroImage} ${styles.swlHeroEmpty}`} aria-hidden="true">
            <ImageOff size={28} />
          </div>
        )}
        <figcaption className={styles.swlHeroCaption}>
          اكتشف الكلمات التي تصف الصورة
        </figcaption>
      </figure>

      <div className={styles.swlSlots} aria-live="polite">
        {solvedWords.map((word) => (
          <span key={word} className={styles.swlSolvedChip}>
            {word}
          </span>
        ))}
        {targetLengths.map((length, index) => (
          <span
            key={`slot-${index}-${length}`}
            className={styles.swlSlotChip}
            aria-label={`كلمة من ${formatNumber(length)} حروف`}
          >
            {'ـ'.repeat(length)}
          </span>
        ))}
      </div>

      <div
        className={`${styles.swlAttempt} ${rejected ? styles.swlAttemptRejected : ''}`}
        aria-live="polite"
        data-testid="swl-attempt"
      >
        {usedIndices.length === 0 ? (
          <span className={styles.swlAttemptHint}>اضغط المقاطع لتكوين كلمة…</span>
        ) : (
          usedIndices.map((index, position) => (
            <button
              key={index}
              type="button"
              className={styles.swlAttemptPiece}
              style={{ animationDelay: `${position * 45}ms` }}
              onClick={() => handleRemoveFragment(index)}
              disabled={disabled}
              aria-label={`إزالة المقطع ${puzzle.fragments[index] ?? ''}`}
            >
              {puzzle.fragments[index] ?? ''}
            </button>
          ))
        )}
      </div>

      <div className={styles.swlPool} role="group" aria-label="مقاطع الحروف">
        {puzzle.fragments.map((fragment, index) => {
          const isUsed = usedIndices.includes(index);
          return (
            <button
              key={index}
              type="button"
              className={`${styles.swlFragment} ${isUsed ? styles.swlFragmentUsed : ''}`}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => handleFragmentClick(index)}
              disabled={disabled || isUsed}
              aria-pressed={isUsed}
            >
              {fragment}
            </button>
          );
        })}
      </div>

      <div className={styles.swlBoardActions}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={disabled || usedIndices.length === 0}
        >
          <Eraser aria-hidden="true" size={16} />
          مسح المحاولة
        </Button>
      </div>
    </section>
  );
}
