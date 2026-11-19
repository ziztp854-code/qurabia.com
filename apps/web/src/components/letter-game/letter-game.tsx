'use client';

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Library } from 'lucide-react';
import {
  AiGameQuestionControls,
  useAiGameQuestions,
} from '@/components/games/ai-game-question-refresh';
import { toGameQuestionFeed } from '@/lib/ai/game-question-refresh-contract';
import {
  BOARD_LETTERS,
  getNextQuestionForLetter,
  LETTER_QUESTION_POOL,
} from '@/lib/letter-game/questions';
import { createInitialLetterGameState, letterGameReducer } from '@/lib/letter-game/state';
import type { HistoryResult, LetterQuestion } from '@/lib/letter-game/types';
import { adaptFeedToLetterQuestions } from '@/lib/questions/feed/adapters/to-letter';
import { GameHistory } from './game-history';
import { HexBoard } from './hex-board';
import { QuestionPanel } from './question-panel';
import { RoundInfo } from './round-info';
import { TeamCard } from './team-card';
import { TurnIndicator } from './turn-indicator';
import { VictoryOverlay } from './victory-overlay';
import styles from './letter-game.module.css';

export function LetterGame({
  questions: initialQuestions = LETTER_QUESTION_POOL,
  savedPacks,
}: {
  questions?: readonly LetterQuestion[];
  savedPacks?: ReactNode;
}) {
  const generated = useAiGameQuestions('letter-challenge');
  const batchId = generated?.batchId;
  const generatedQuestions = generated?.questions;
  const registerPrompts = generated?.register;
  const questions = useMemo(
    () =>
      generatedQuestions && batchId
        ? adaptFeedToLetterQuestions(toGameQuestionFeed(generatedQuestions, batchId), () => 0)
        : initialQuestions,
    [generatedQuestions, batchId, initialQuestions],
  );
  const [state, dispatch] = useReducer(letterGameReducer, undefined, createInitialLetterGameState);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [feedback, setFeedback] = useState<HistoryResult | null>(null);
  const [lastClaimed, setLastClaimed] = useState<string | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const gameRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(state.gameStatus);
  const latestEntry = state.history[0];
  const currentPrompt = state.currentQuestion?.prompt;

  useEffect(() => {
    if (!registerPrompts || batchId) return;
    // Reserve room for played questions while representing every letter in the initial bank.
    const prompts = BOARD_LETTERS.flatMap((letter) =>
      initialQuestions
        .filter((question) => question.letter === letter)
        .slice(0, 2)
        .map((question) => question.prompt),
    );
    registerPrompts(prompts);
  }, [batchId, initialQuestions, registerPrompts]);

  useEffect(() => {
    if (currentPrompt) registerPrompts?.([currentPrompt]);
  }, [currentPrompt, registerPrompts]);

  useEffect(() => {
    if (!batchId) return;
    const frame = window.requestAnimationFrame(() =>
      gameRef.current
        ?.querySelector<HTMLButtonElement>('[data-letter-cell][tabindex="0"]')
        ?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [batchId]);

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
    const timedOut = previousStatus.current === 'question' && latestEntry?.result === 'timeout';
    previousStatus.current = state.gameStatus;
    if (timedOut) {
      window.requestAnimationFrame(() =>
        document.getElementById('letter-turn-indicator')?.focus({ preventScroll: true }),
      );
    }
  }, [latestEntry, state.gameStatus]);

  const greenCount = state.board.cells.filter((cell) => cell.owner === 'green').length;
  const orangeCount = state.board.cells.filter((cell) => cell.owner === 'orange').length;
  const available = state.board.cells.length - greenCount - orangeCount;
  const roundAnnouncement =
    state.gameStatus === 'finished' && state.winner
      ? `فاز الفريق ${state.winner === 'green' ? 'الأخضر' : 'البرتقالي'}.`
      : `الدور الآن للفريق ${state.currentTeam === 'green' ? 'الأخضر' : 'البرتقالي'}.`;
  const announcement = latestEntry
    ? `${latestEntry.label} للفريق ${latestEntry.team === 'green' ? 'الأخضر' : 'البرتقالي'} عند الحرف ${latestEntry.letter}. ${roundAnnouncement}`
    : batchId
      ? `تم اعتماد الأسئلة الجديدة. ${roundAnnouncement}`
      : '';

  function handleSelect(cellId: string) {
    const letter = state.board.cells.find((cell) => cell.id === cellId)?.letter;
    const question = letter
      ? getNextQuestionForLetter(letter, questions, state.usedQuestionIds)
      : undefined;
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

  const replacementQuestion = state.currentQuestion
    ? getNextQuestionForLetter(
        state.currentQuestion.letter,
        questions,
        state.usedQuestionIds,
        state.currentQuestion,
      )
    : undefined;

  function handleReplaceQuestion() {
    if (!replacementQuestion) return;
    dispatch({ type: 'replace-question', question: replacementQuestion, now: Date.now() });
    window.requestAnimationFrame(() =>
      document.getElementById('letter-question-panel')?.focus({ preventScroll: true }),
    );
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
          <h1>تحدي الحروف</h1>
          <p>أجب بكلمة تبدأ بالحرف المختار، وصِل بين طرفَي فريقك للفوز.</p>
        </div>
        <div
          className={styles.questionTools}
          onKeyDown={(event) => {
            if (event.key !== 'Escape' || !(event.target instanceof HTMLElement)) return;
            const details = event.target.closest<HTMLDetailsElement>(
              'details[name="letter-question-tools"][open]',
            );
            if (!details) return;
            event.stopPropagation();
            details.open = false;
            details.querySelector('summary')?.focus();
          }}
        >
          <AiGameQuestionControls />
          {savedPacks && (
            <details className={styles.savedPacks} name="letter-question-tools">
              <summary>
                <Library aria-hidden="true" />
                الحزم المحفوظة
                <ChevronDown aria-hidden="true" />
              </summary>
              <div>{savedPacks}</div>
            </details>
          )}
        </div>
      </header>

      <section className={styles.teamBar} aria-label="الفريقان">
        <TeamCard team="green" count={greenCount} active={state.currentTeam === 'green'} />
        <TurnIndicator team={state.currentTeam} />
        <TeamCard team="orange" count={orangeCount} active={state.currentTeam === 'orange'} />
      </section>

      <div className={styles.gameLayout}>
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
            key={`${state.round}-${state.currentQuestion?.id ?? 'empty'}`}
            question={state.currentQuestion}
            timer={state.timer}
            team={state.currentTeam}
            feedback={feedback}
            onJudge={handleJudge}
            onReplace={handleReplaceQuestion}
            canReplace={Boolean(replacementQuestion)}
          />
        </aside>

        <aside className={styles.roundRail} aria-label="معلومات الجولة وسجل اللعب">
          <RoundInfo round={state.round} available={available} onReset={handleReset} />
          <GameHistory
            history={state.history}
            open={historyOpen}
            onOpen={() => setHistoryOpen(true)}
            onClose={() => setHistoryOpen(false)}
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
