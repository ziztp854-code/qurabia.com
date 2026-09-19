'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { Blocks, Sparkles } from 'lucide-react';
import { getQuestionForLetter, LETTER_QUESTIONS } from '@/lib/letter-game/questions';
import { createInitialLetterGameState, letterGameReducer } from '@/lib/letter-game/state';
import type { HistoryResult, LetterQuestion } from '@/lib/letter-game/types';
import { GameHistory } from './game-history';
import { HexBoard } from './hex-board';
import { QuestionPanel } from './question-panel';
import { RoundInfo } from './round-info';
import { TeamCard } from './team-card';
import { TurnIndicator } from './turn-indicator';
import { VictoryOverlay } from './victory-overlay';
import styles from './letter-game.module.css';

export function LetterGame({
  questions = LETTER_QUESTIONS,
}: {
  questions?: readonly LetterQuestion[];
}) {
  const [state, dispatch] = useReducer(letterGameReducer, undefined, createInitialLetterGameState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [feedback, setFeedback] = useState<HistoryResult | null>(null);
  const [lastClaimed, setLastClaimed] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(state.gameStatus);

  useEffect(() => {
    if (state.gameStatus !== 'question') return undefined;
    const syncTimer = () => dispatch({ type: 'tick', now: Date.now() });
    const interval = window.setInterval(syncTimer, 250);
    document.addEventListener('visibilitychange', syncTimer);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncTimer);
    };
  }, [state.gameStatus, state.selectedCell]);

  useEffect(
    () => () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  useEffect(() => {
    const timedOut = previousStatus.current === 'question' && state.gameStatus === 'playing';
    previousStatus.current = state.gameStatus;
    if (timedOut) {
      window.requestAnimationFrame(() =>
        document.getElementById('letter-turn-indicator')?.focus({ preventScroll: true }),
      );
    }
  }, [state.gameStatus]);

  const greenCount = state.board.cells.filter((cell) => cell.owner === 'green').length;
  const orangeCount = state.board.cells.filter((cell) => cell.owner === 'orange').length;
  const available = state.board.cells.length - greenCount - orangeCount;
  const latestEntry = state.history[0];
  const roundAnnouncement =
    state.gameStatus === 'finished' && state.winner
      ? `فاز الفريق ${state.winner === 'green' ? 'الأخضر' : 'البرتقالي'}.`
      : `الدور الآن للفريق ${state.currentTeam === 'green' ? 'الأخضر' : 'البرتقالي'}.`;
  const announcement = latestEntry
    ? `${latestEntry.label} للفريق ${latestEntry.team === 'green' ? 'الأخضر' : 'البرتقالي'} عند الحرف ${latestEntry.letter}. ${roundAnnouncement}`
    : '';

  function handleSelect(cellId: string) {
    const letter = state.board.cells.find((cell) => cell.id === cellId)?.letter;
    const question = letter ? getQuestionForLetter(letter, questions) : undefined;
    dispatch({ type: 'select-cell', cellId, now: Date.now(), question });
    window.requestAnimationFrame(() => {
      const panel = document.getElementById('letter-question-panel');
      panel?.focus({ preventScroll: true });
      if (panel && window.matchMedia('(max-width: 58rem)').matches) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel.scrollIntoView({
          behavior: reducedMotion ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    });
  }

  function handleJudge(result: 'correct' | 'wrong' | 'skipped') {
    const now = Date.now();
    const resolvedResult = state.expiresAt !== null && now >= state.expiresAt ? 'timeout' : result;
    setFeedback(resolvedResult);
    if (resolvedResult === 'correct') setLastClaimed(state.selectedCell);
    dispatch({ type: 'judge', result, now });
    window.requestAnimationFrame(() =>
      document.getElementById('letter-turn-indicator')?.focus({ preventScroll: true }),
    );
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setFeedback(null);
      setLastClaimed(null);
    }, 650);
  }

  function handleReset() {
    setHistoryOpen(false);
    setFeedback(null);
    setLastClaimed(null);
    dispatch({ type: 'reset' });
    window.requestAnimationFrame(() =>
      gameRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label*="خلية متاحة"]')
        ?.focus(),
    );
  }

  return (
    <div
      ref={gameRef}
      className={styles.game}
      data-game="letter-challenge"
      data-feedback={feedback ?? undefined}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <header className={styles.gameHeader}>
        <div className={styles.gameTitle}>
          <span>
            <Blocks aria-hidden="true" />
            لعبة فرق عربية
          </span>
          <h1>تحدي الحروف</h1>
          <p>اختر حرفًا، أجب، وابنِ طريق فريقك عبر الشبكة.</p>
        </div>
        <span className={styles.gameStatus}>
          <Sparkles aria-hidden="true" />
          جاهزة للعب
        </span>
      </header>

      <section className={styles.teamBar} aria-label="الفريقان">
        <TeamCard team="green" count={greenCount} active={state.currentTeam === 'green'} />
        <TurnIndicator team={state.currentTeam} />
        <TeamCard team="orange" count={orangeCount} active={state.currentTeam === 'orange'} />
      </section>

      <div className={styles.gameLayout}>
        <aside className={styles.roundRail} aria-label="معلومات الجولة وسجل اللعب">
          <RoundInfo round={state.round} available={available} onReset={handleReset} />
          <GameHistory
            history={state.history}
            open={historyOpen}
            onOpen={() => setHistoryOpen(true)}
            onClose={() => setHistoryOpen(false)}
          />
        </aside>

        <HexBoard
          board={state.board}
          selectedCell={state.selectedCell}
          winningPath={state.winningPath}
          lastClaimed={lastClaimed}
          canSelect={state.gameStatus === 'playing'}
          onSelect={handleSelect}
        />

        <aside className={styles.questionRail} aria-label="لوحة السؤال والتحكم">
          <QuestionPanel
            key={state.round}
            question={state.currentQuestion}
            timer={state.timer}
            team={state.currentTeam}
            feedback={feedback}
            onJudge={handleJudge}
          />
        </aside>
      </div>

      <VictoryOverlay
        winner={state.winner}
        pathLength={state.winningPath.length}
        onReset={handleReset}
      />
    </div>
  );
}
