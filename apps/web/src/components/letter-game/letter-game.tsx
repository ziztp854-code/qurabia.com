'use client';

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Library, RotateCcw } from 'lucide-react';
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
  const gameRef = useRef<HTMLDivElement>(null);
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

  const greenCount = state.board.cells.filter((cell) => cell.owner === 'green').length;
  const orangeCount = state.board.cells.filter((cell) => cell.owner === 'orange').length;
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
    dispatch({ type: 'select-cell', cellId, question });
    window.requestAnimationFrame(() => {
      const panel = gameRef.current?.querySelector<HTMLElement>('#letter-question-panel');
      panel?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 44rem)').matches) {
        panel?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
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
    dispatch({ type: 'replace-question', question: replacementQuestion });
    window.requestAnimationFrame(() =>
      gameRef.current
        ?.querySelector<HTMLElement>('#letter-question-panel')
        ?.focus({ preventScroll: true }),
    );
  }

  function handleJudge(result: HistoryResult) {
    dispatch({ type: 'judge', result });
    window.requestAnimationFrame(() => {
      if (!gameRef.current?.querySelector('[aria-modal="true"]')) {
        gameRef.current
          ?.querySelector<HTMLElement>('#letter-turn-indicator')
          ?.focus({ preventScroll: true });
      }
    });
  }

  function handleReset() {
    setHistoryOpen(false);
    dispatch({ type: 'reset' });
    window.requestAnimationFrame(() =>
      gameRef.current
        ?.querySelector<HTMLButtonElement>('[data-letter-cell]:not(:disabled)')
        ?.focus(),
    );
  }

  return (
    <div
      ref={gameRef}
      className={styles.game}
      data-game="letter-challenge"
      data-turn={state.currentTeam}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className={styles.arena}>
        <header className={styles.gameMasthead}>
          <h1>تحدي الحروف</h1>
          <section className={styles.teamBar} aria-label="الفريقان">
            <TeamCard team="green" count={greenCount} active={state.currentTeam === 'green'} />
            <TeamCard team="orange" count={orangeCount} active={state.currentTeam === 'orange'} />
          </section>
        </header>

        <div className={styles.gameLayout}>
          <HexBoard
            board={state.board}
            selectedCell={state.selectedCell}
            winningPath={state.winningPath}
            canSelect={state.gameStatus === 'playing'}
            onSelect={handleSelect}
          />
          <QuestionPanel
            key={`${state.round}-${state.currentQuestion?.id ?? 'empty'}`}
            question={state.currentQuestion}
            onJudge={handleJudge}
            onReplace={handleReplaceQuestion}
            canReplace={Boolean(replacementQuestion)}
          />
        </div>
      </div>

      <section className={styles.sessionTools} aria-label="أدوات الجولة">
        <TurnIndicator team={state.currentTeam} />
        <div className={styles.sessionActions}>
          <Link className={styles.secondaryControl} href="/games/">
            <ChevronRight aria-hidden="true" />
            الألعاب
          </Link>
          <button className={styles.secondaryControl} type="button" onClick={handleReset}>
            <RotateCcw aria-hidden="true" />
            بدء جولة جديدة
          </button>
          <GameHistory
            history={state.history}
            open={historyOpen}
            onOpen={() => setHistoryOpen(true)}
            onClose={() => setHistoryOpen(false)}
          />
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
      </section>

      <VictoryOverlay
        winner={state.winner}
        pathLength={state.winningPath.length}
        onReset={handleReset}
      />
    </div>
  );
}
