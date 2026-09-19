'use client';

/*
 * THESIS: لوحة مضيف تحوّل الفئات إلى ساحة قرار، لا نسخة من شبكة بطاقات منافس.
 * OWN-WORLD: أسود عميق، ذهب دافئ، سماوي تقني، وألواح بث ذات حواف دقيقة.
 * STORY: يجهّز المضيف الفرق والفئات، يفتح السؤال، يكشف الحل، ثم يحكم بوضوح.
 * FIRST VIEWPORT: شريط مواجهة حي فوق شبكة قيم كبيرة، والقرار الأساسي في المنتصف.
 * FORM: Quantum Workbench ممتد من نظام تحدّي الحالي؛ بنية تشغيلية كثيفة وواضحة.
 */

import {
  ArrowLeft,
  BadgeHelp,
  Check,
  ChevronLeft,
  CircleOff,
  Eye,
  Gauge,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldQuestion,
  Sparkles,
  Swords,
  TimerReset,
  Trophy,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { getGameMotionScene } from '@/lib/motion';
import { formatNumber } from '@/lib/utils';
import {
  CATEGORY_BOARD_LIBRARY,
  type CategoryBoardCategory,
  type CategoryBoardQuestion,
} from './category-board-data';
import styles from './category-board-room.module.css';

type TeamId = 'cyan' | 'gold';
type Phase = 'setup' | 'board' | 'question' | 'answer';
type HelperId = 'double' | 'twoAnswers' | 'cheat';
type Assignments = Record<string, TeamId | null>;
type HelperUsage = Record<TeamId, Record<HelperId, boolean>>;

function buildDefaultAssignments(library: readonly CategoryBoardCategory[]): Assignments {
  return Object.fromEntries(
    library.map((category, index) => [
      category.id,
      index < 3 ? 'cyan' : index < 6 ? 'gold' : null,
    ]),
  );
}

const DEFAULT_HELPERS: HelperUsage = {
  cyan: { double: false, twoAnswers: false, cheat: false },
  gold: { double: false, twoAnswers: false, cheat: false },
};

const TEAM_META = {
  cyan: { defaultName: 'الفريق السماوي', label: 'السماوي' },
  gold: { defaultName: 'الفريق الذهبي', label: 'الذهبي' },
} as const;

function ScoreControl({
  team,
  name,
  score,
  onAdjust,
}: {
  team: TeamId;
  name: string;
  score: number;
  onAdjust: (amount: number) => void;
}) {
  return (
    <section className={styles.scorePanel} data-team={team} aria-label={`نتيجة ${name}`}>
      <div>
        <span>{name}</span>
        <strong data-testid={`score-${team}`}>{formatNumber(score)}</strong>
      </div>
      <div className={styles.scoreButtons}>
        <button type="button" onClick={() => onAdjust(100)} aria-label={`أضف 100 إلى ${name}`}>
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onAdjust(-100)}
          aria-label={`اخصم 100 من ${name}`}
          disabled={score === 0}
        >
          <Minus aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function HelperButton({
  id,
  title,
  description,
  used,
  active,
  disabled,
  onClick,
}: {
  id: HelperId;
  title: string;
  description: string;
  used: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = id === 'double' ? Sparkles : id === 'twoAnswers' ? ShieldQuestion : Search;
  const availableLabel =
    id === 'double'
      ? 'دبلها — ضاعف السؤال التالي'
      : id === 'twoAnswers'
        ? 'إجابتان — اسمح بمحاولتين'
        : 'تحايل — 15 ثانية للبحث';
  return (
    <button
      type="button"
      className={styles.helperButton}
      data-active={active || undefined}
      disabled={used || disabled}
      onClick={onClick}
      aria-label={used ? `${title} — استُخدمت` : availableLabel}
    >
      <Icon aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{used ? 'استُخدمت' : description}</small>
      </span>
      {used && <Check aria-hidden="true" />}
    </button>
  );
}

function SetupScreen({
  library,
  assignments,
  teamNames,
  onAssign,
  onNameChange,
  onStart,
}: {
  library: readonly CategoryBoardCategory[];
  assignments: Assignments;
  teamNames: Record<TeamId, string>;
  onAssign: (categoryId: string, team: TeamId | null) => void;
  onNameChange: (team: TeamId, value: string) => void;
  onStart: () => void;
}) {
  const counts = {
    cyan: Object.values(assignments).filter((team) => team === 'cyan').length,
    gold: Object.values(assignments).filter((team) => team === 'gold').length,
  };
  const validNames = teamNames.cyan.trim().length >= 2 && teamNames.gold.trim().length >= 2;
  const ready = counts.cyan === 3 && counts.gold === 3 && validNames;

  return (
    <div className={styles.setupShell}>
      <header className={styles.setupIntro}>
        <ButtonLink href="/games" variant="ghost">
          <ArrowLeft aria-hidden="true" />
          كل الألعاب
        </ButtonLink>
        <div className={styles.modeBadge}>
          <Gauge aria-hidden="true" />
          وضع محلي · شاشة واحدة
        </div>
        <h1>جهّز مواجهة الفئات</h1>
        <p>
          سمِّ الفريقين ووزّع ثلاث فئات لكل فريق. بعد البداية تصبح هذه الشاشة لوحة المضيف للتحكيم
          والنقاط.
        </p>
      </header>

      <section className={styles.teamSetup} aria-label="إعداد الفريقين">
        {(['cyan', 'gold'] as const).map((team) => (
          <label key={team} data-team={team}>
            <span>{TEAM_META[team].defaultName}</span>
            <input
              value={teamNames[team]}
              onChange={(event) => onNameChange(team, event.target.value.slice(0, 24))}
              required
              minLength={2}
              maxLength={24}
              aria-invalid={teamNames[team].trim().length < 2}
            />
            <small>{formatNumber(counts[team])} من 3 فئات</small>
          </label>
        ))}
      </section>

      <div className={styles.selectionStatus} aria-live="polite">
        <span data-ready={counts.cyan === 3 || undefined}>3 فئات للفريق السماوي</span>
        <span data-ready={counts.gold === 3 || undefined}>3 فئات للفريق الذهبي</span>
      </div>

      <section className={styles.categoryPicker} aria-label="اختيار الفئات">
        {library.map((category) => {
          const owner = assignments[category.id];
          return (
            <article key={category.id} data-owner={owner ?? undefined}>
              <div className={styles.categoryMark} aria-hidden="true">
                {category.shortLabel}
              </div>
              <div className={styles.categoryCopy}>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
                <div className={styles.categoryMeta}>
                  <span>{formatNumber(category.questions.length)} أسئلة</span>
                  <span data-owner={owner ?? 'open'}>
                    {owner ? `لـ ${TEAM_META[owner].defaultName}` : 'غير محددة'}
                  </span>
                </div>
              </div>
              <div className={styles.assignmentButtons}>
                <button
                  type="button"
                  data-selected={owner === 'cyan' || undefined}
                  aria-pressed={owner === 'cyan'}
                  aria-label={`إسناد ${category.title} إلى الفريق السماوي`}
                  disabled={owner !== 'cyan' && counts.cyan >= 3}
                  onClick={() => onAssign(category.id, owner === 'cyan' ? null : 'cyan')}
                >
                  السماوي
                </button>
                <button
                  type="button"
                  data-selected={owner === 'gold' || undefined}
                  aria-pressed={owner === 'gold'}
                  aria-label={`إسناد ${category.title} إلى الفريق الذهبي`}
                  disabled={owner !== 'gold' && counts.gold >= 3}
                  onClick={() => onAssign(category.id, owner === 'gold' ? null : 'gold')}
                >
                  الذهبي
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <footer className={styles.setupFooter}>
        <div>
          <UsersRound aria-hidden="true" />
          <span>
            {formatNumber(library.length)} فئة متاحة · 6 في الجولة ·{' '}
            {formatNumber(library.reduce((total, category) => total + category.questions.length, 0))}{' '}
            سؤالًا
          </span>
        </div>
        <Button variant="gold" size="lg" disabled={!ready} onClick={onStart}>
          <Swords aria-hidden="true" />
          ابدأ لوحة المضيف
        </Button>
      </footer>
    </div>
  );
}

export function CategoryBoardRoom({
  library = CATEGORY_BOARD_LIBRARY,
}: {
  library?: readonly CategoryBoardCategory[];
}) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [assignments, setAssignments] = useState<Assignments>(() =>
    buildDefaultAssignments(library),
  );
  const [teamNames, setTeamNames] = useState<Record<TeamId, string>>({
    cyan: TEAM_META.cyan.defaultName,
    gold: TEAM_META.gold.defaultName,
  });
  const [scores, setScores] = useState<Record<TeamId, number>>({ cyan: 0, gold: 0 });
  const [turn, setTurn] = useState<TeamId>('cyan');
  const [usedQuestionIds, setUsedQuestionIds] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<CategoryBoardQuestion | null>(null);
  const [currentCategory, setCurrentCategory] = useState<CategoryBoardCategory | null>(null);
  const [questionMultiplier, setQuestionMultiplier] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [helperUsage, setHelperUsage] = useState<HelperUsage>(DEFAULT_HELPERS);
  const [pendingDouble, setPendingDouble] = useState(false);
  const [helperNotice, setHelperNotice] = useState('');
  const [cheatSeconds, setCheatSeconds] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const selectedCategories = useMemo(
    () => library.filter((category) => assignments[category.id]),
    [assignments, library],
  );
  const totalQuestions = selectedCategories.reduce(
    (total, category) => total + category.questions.length,
    0,
  );
  const finished = totalQuestions > 0 && usedQuestionIds.length === totalQuestions;
  const currentValue = currentQuestion ? currentQuestion.value * questionMultiplier : 0;

  useEffect(() => {
    if (phase !== 'question' || timerPaused || cheatSeconds !== null) return;
    const interval = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase, timerPaused, cheatSeconds]);

  useEffect(() => {
    if (cheatSeconds === null) return;
    const timeout = window.setTimeout(
      () => setCheatSeconds((value) => (value === null || value <= 1 ? null : value - 1)),
      1000,
    );
    return () => window.clearTimeout(timeout);
  }, [cheatSeconds]);

  const activateHelper = (helper: HelperId) => {
    if (helperUsage[turn][helper]) return;
    setHelperUsage((current) => ({
      ...current,
      [turn]: { ...current[turn], [helper]: true },
    }));
    if (helper === 'double') {
      setPendingDouble(true);
      setHelperNotice('تم تفعيل دبلها: السؤال التالي يحتسب بضعف قيمته.');
    } else if (helper === 'twoAnswers') {
      setHelperNotice('للفريق محاولتان قبل اعتماد الحكم النهائي.');
    } else {
      setCheatSeconds(15);
      setHelperNotice('بدأت مهلة البحث. يتوقف مؤقت السؤال حتى تنتهي.');
    }
  };

  const openQuestion = (category: CategoryBoardCategory, question: CategoryBoardQuestion) => {
    if (usedQuestionIds.includes(question.id)) return;
    setCurrentCategory(category);
    setCurrentQuestion(question);
    setQuestionMultiplier(pendingDouble ? 2 : 1);
    setPendingDouble(false);
    setElapsedSeconds(0);
    setTimerPaused(false);
    setHelperNotice('');
    setCheatSeconds(null);
    setPhase('question');
    window.setTimeout(() => boardRef.current?.focus(), 0);
  };

  const awardQuestion = (winner: TeamId | null) => {
    if (!currentQuestion) return;
    if (winner) {
      setScores((current) => ({ ...current, [winner]: current[winner] + currentValue }));
    }
    setUsedQuestionIds((current) => [...current, currentQuestion.id]);
    setTurn((current) => (current === 'cyan' ? 'gold' : 'cyan'));
    setCurrentQuestion(null);
    setCurrentCategory(null);
    setQuestionMultiplier(1);
    setHelperNotice('');
    setCheatSeconds(null);
    setPhase('board');
  };

  const resetGame = () => {
    if (!window.confirm('هل تريد بدء إعداد جديد؟ ستُمسح نتيجة الجولة الحالية.')) return;
    setPhase('setup');
    setAssignments(buildDefaultAssignments(library));
    setScores({ cyan: 0, gold: 0 });
    setTurn('cyan');
    setUsedQuestionIds([]);
    setCurrentQuestion(null);
    setCurrentCategory(null);
    setHelperUsage(DEFAULT_HELPERS);
    setPendingDouble(false);
    setHelperNotice('');
  };

  if (phase === 'setup') {
    return (
      <MotionScene scene="intro">
        <SetupScreen
          library={library}
          assignments={assignments}
          teamNames={teamNames}
          onAssign={(categoryId, team) =>
            setAssignments((current) => ({ ...current, [categoryId]: team }))
          }
          onNameChange={(team, value) => setTeamNames((current) => ({ ...current, [team]: value }))}
          onStart={() => {
            setTeamNames((current) => ({
              cyan: current.cyan.trim(),
              gold: current.gold.trim(),
            }));
            setPhase('board');
          }}
        />
      </MotionScene>
    );
  }

  return (
    <MotionScene scene={getGameMotionScene(phase)} sceneKey={phase}>
      <div className={styles.hostShell} ref={boardRef} tabIndex={-1}>
      <header className={styles.hostHeader}>
        <div>
          <span className={styles.liveBadge}>
            <span aria-hidden="true" /> LIVE
          </span>
          <h1>لوحة الفئات</h1>
          <p>{finished ? 'اكتملت جميع الأسئلة' : `دور ${teamNames[turn]}`}</p>
        </div>
        <div className={styles.roundProgress}>
          <span>{formatNumber(usedQuestionIds.length)} سؤال مكتمل</span>
          <strong>{formatNumber(totalQuestions - usedQuestionIds.length)} متبقٍ</strong>
        </div>
        <button type="button" className={styles.resetButton} onClick={resetGame}>
          <RotateCcw aria-hidden="true" />
          إعداد جديد
        </button>
      </header>

      <div className={styles.scoreRail}>
        <ScoreControl
          team="cyan"
          name={teamNames.cyan}
          score={scores.cyan}
          onAdjust={(amount) =>
            setScores((current) => ({
              cyan: Math.max(0, current.cyan + amount),
              gold: current.gold,
            }))
          }
        />
        <div className={styles.turnCore} data-team={turn}>
          <Swords aria-hidden="true" />
          <span>{finished ? 'النتيجة النهائية' : `دور ${teamNames[turn]}`}</span>
        </div>
        <ScoreControl
          team="gold"
          name={teamNames.gold}
          score={scores.gold}
          onAdjust={(amount) =>
            setScores((current) => ({
              cyan: current.cyan,
              gold: Math.max(0, current.gold + amount),
            }))
          }
        />
      </div>

      {phase === 'board' && (
        <>
          <section className={styles.helpersBar} aria-label={`وسائل ${teamNames[turn]}`}>
            <div>
              <BadgeHelp aria-hidden="true" />
              <span>وسائل {teamNames[turn]}</span>
            </div>
            <HelperButton
              id="double"
              title="دبلها"
              description="ضاعف السؤال التالي"
              used={helperUsage[turn].double}
              active={pendingDouble}
              onClick={() => activateHelper('double')}
            />
            <HelperButton
              id="twoAnswers"
              title="إجابتان"
              description="بعد فتح السؤال"
              used={helperUsage[turn].twoAnswers}
              disabled
              onClick={() => activateHelper('twoAnswers')}
            />
            <HelperButton
              id="cheat"
              title="تحايل"
              description="بعد فتح السؤال"
              used={helperUsage[turn].cheat}
              disabled
              onClick={() => activateHelper('cheat')}
            />
          </section>

          {helperNotice && <p className={styles.helperNotice}>{helperNotice}</p>}

          {finished ? (
            <section className={styles.finishPanel}>
              <Trophy aria-hidden="true" />
              <span>اكتملت المواجهة</span>
              <h2>
                {scores.cyan === scores.gold
                  ? 'تعادل مستحق'
                  : `الفائز: ${scores.cyan > scores.gold ? teamNames.cyan : teamNames.gold}`}
              </h2>
              <p>
                {formatNumber(scores.cyan)} — {formatNumber(scores.gold)}
              </p>
              <Button variant="gold" size="lg" onClick={resetGame}>
                <RotateCcw aria-hidden="true" />
                مواجهة جديدة
              </Button>
            </section>
          ) : (
            <section className={styles.board} aria-label="شبكة الفئات والأسئلة">
              {selectedCategories.map((category) => (
                <article className={styles.categoryColumn} key={category.id}>
                  <header>
                    <span aria-hidden="true">{category.shortLabel}</span>
                    <h2>{category.title}</h2>
                    <small>
                      {assignments[category.id] === 'cyan' ? teamNames.cyan : teamNames.gold} ·{' '}
                      {formatNumber(
                        category.questions.filter(
                          (question) => !usedQuestionIds.includes(question.id),
                        ).length,
                      )}{' '}
                      متبقية
                    </small>
                  </header>
                  <div>
                    {category.questions.map((question) => {
                      const used = usedQuestionIds.includes(question.id);
                      return (
                        <button
                          type="button"
                          key={question.id}
                          disabled={used}
                          data-used={used || undefined}
                          aria-label={`سؤال ${category.title} بقيمة ${formatNumber(question.value)} — ${used ? 'مستخدم' : 'متاح'}`}
                          onClick={() => openQuestion(category, question)}
                        >
                          <span>{formatNumber(question.value)}</span>
                          {used ? <Check aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      {(phase === 'question' || phase === 'answer') && currentQuestion && currentCategory && (
        <main className={styles.questionStage}>
          <div className={styles.questionToolbar}>
            <button
              type="button"
              onClick={() => setTimerPaused((value) => !value)}
              aria-label={timerPaused ? 'استأنف المؤقت' : 'أوقف المؤقت'}
            >
              {timerPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              <span>{formatNumber(elapsedSeconds).padStart(2, '0')}</span>
            </button>
            <div>
              <span>{currentCategory.title}</span>
              <strong>{formatNumber(currentValue)}</strong>
            </div>
            <button
              type="button"
              className={styles.backToBoard}
              onClick={() => {
                setPhase('board');
                setCurrentQuestion(null);
                setCurrentCategory(null);
                setPendingDouble(questionMultiplier === 2);
              }}
            >
              الرجوع للوحة
              <ArrowLeft aria-hidden="true" />
            </button>
          </div>

          <section className={styles.questionPanel} data-phase={phase}>
            <div className={styles.questionMeta}>
              <span>{phase === 'question' ? 'السؤال مفتوح' : 'الإجابة'}</span>
              <span>القيمة {formatNumber(currentValue)}</span>
            </div>
            {phase === 'question' ? (
              <>
                <h2>{currentQuestion.prompt}</h2>
                {questionMultiplier === 2 && (
                  <p className={styles.multiplierNotice}>
                    قيمة السؤال المضاعفة: {formatNumber(currentValue)}
                  </p>
                )}
                {helperNotice && <p className={styles.inQuestionNotice}>{helperNotice}</p>}
                <div className={styles.inQuestionHelpers}>
                  <HelperButton
                    id="twoAnswers"
                    title="إجابتان"
                    description="اسمح بمحاولتين"
                    used={helperUsage[turn].twoAnswers}
                    onClick={() => activateHelper('twoAnswers')}
                  />
                  <HelperButton
                    id="cheat"
                    title="تحايل"
                    description="15 ثانية للبحث"
                    used={helperUsage[turn].cheat}
                    disabled={cheatSeconds !== null}
                    onClick={() => activateHelper('cheat')}
                  />
                </div>
                <Button variant="gold" size="lg" onClick={() => setPhase('answer')}>
                  <Eye aria-hidden="true" />
                  اكشف الإجابة
                </Button>
              </>
            ) : (
              <>
                <span className={styles.answerLabel}>الإجابة</span>
                <h2>{currentQuestion.answer}</h2>
                {currentQuestion.note && <p>{currentQuestion.note}</p>}
                <div className={styles.judgePanel} aria-label="من أجاب؟">
                  <button type="button" data-team="cyan" onClick={() => awardQuestion('cyan')}>
                    <Check aria-hidden="true" />
                    {teamNames.cyan} أجاب
                    <small>+{formatNumber(currentValue)}</small>
                  </button>
                  <button type="button" data-team="gold" onClick={() => awardQuestion('gold')}>
                    <Check aria-hidden="true" />
                    {teamNames.gold} أجاب
                    <small>+{formatNumber(currentValue)}</small>
                  </button>
                  <button type="button" onClick={() => awardQuestion(null)}>
                    <CircleOff aria-hidden="true" />
                    ولا أحد
                    <small>من دون نقاط</small>
                  </button>
                </div>
              </>
            )}
          </section>

          {cheatSeconds !== null && (
            <aside className={styles.cheatOverlay} role="status">
              <TimerReset aria-hidden="true" />
              <div>
                <span>مهلة البحث</span>
                <strong>{formatNumber(cheatSeconds)}</strong>
                <small>ثانية</small>
              </div>
              <Button variant="outline" onClick={() => setCheatSeconds(null)}>
                إنهاء مهلة البحث
              </Button>
            </aside>
          )}
        </main>
      )}
      </div>
    </MotionScene>
  );
}
