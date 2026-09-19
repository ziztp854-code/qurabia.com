'use client';

import {
  ArrowRight,
  Brain,
  Check,
  Clock3,
  Crown,
  Eraser,
  Eye,
  Flame,
  Focus,
  Gauge,
  HelpCircle,
  Lightbulb,
  Medal,
  Pause,
  Pin,
  Play,
  Puzzle,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Trophy,
  Undo2,
  Users,
  Zap,
} from 'lucide-react';
import NextLink from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { Button, Card } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { WinnerPodium } from '@/components/quiz';
import { GAME_GUIDES, GameHowTo } from '@/components/games/shared';
import { formatNumber } from '@/lib/utils';
import {
  type MemoryDifficulty,
  type MemorySettings,
  buildRiskDeck,
  MEMORY_DIFFICULTIES,
  MEMORY_MODE_META,
  MEMORY_SYMBOL_BANK,
  COLOR_RUSH_BANK,
  INSTANT_GAME_META,
  QUESTION_WORD_BANK,
  RISK_PRESETS,
  type RiskCard,
  type RiskDifficulty,
  SCRAMBLED_WORDS_ROUNDS,
  SPOT_DIFFERENCE_SCENES,
  type SpotDifferenceScene,
  WORD_CODE_BANK,
  type InstantGameMode,
} from './game-data';
import { BalootRoom } from './baloot-room';

const HIGH_SCORE_KEY = 'tahaddi.memory-flash.high-score';

type ComboState = { count: number; multiplier: number };

function getHighScore(difficulty: MemoryDifficulty) {
  try {
    const raw = localStorage.getItem(`${HIGH_SCORE_KEY}.${difficulty}`);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

// `Date.now()` is a global side-effect (it reads the system clock), so calling
// it during render trips React 19's purity rule. Wrapping the lookup in a
// dedicated helper makes the rule easy to satisfy in event handlers and
// effects without sacrificing sub-millisecond accuracy.
function getNow(): number {
  return Date.now();
}

function setHighScore(difficulty: MemoryDifficulty, value: number) {
  try {
    localStorage.setItem(`${HIGH_SCORE_KEY}.${difficulty}`, String(value));
  } catch {
    // ignore storage errors
  }
}

function getStage(level: number) {
  if (level >= 25) return { label: 'أسطوري', color: '#fbbf24', icon: Trophy };
  if (level >= 18) return { label: 'خبير', color: '#a78bfa', icon: ShieldCheck };
  if (level >= 11) return { label: 'متقدم', color: '#34d399', icon: Zap };
  if (level >= 6) return { label: 'متوسط', color: '#22d3ee', icon: Lightbulb };
  return { label: 'مبتدئ', color: '#f87171', icon: Brain };
}

function ScoreBar({
  score,
  seconds,
  isPaused,
  practice = false,
}: {
  score: number;
  seconds: number;
  isPaused: boolean;
  practice?: boolean;
}) {
  return (
    <div className="instant-scorebar" aria-label="حالة اللعبة">
      <span>
        <Sparkles aria-hidden="true" />
        {practice ? (
          'تدريب بلا نقاط'
        ) : (
          <>
            الرصيد <b>{formatNumber(score)}</b>
          </>
        )}
      </span>
      <span data-ending={seconds <= 10 || undefined} className={isPaused ? 'is-paused' : ''}>
        {isPaused ? <Pause aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
        {practice ? 'بلا مؤقت' : isPaused ? 'متوقف' : `الوقت ${formatNumber(seconds)}`}
      </span>
    </div>
  );
}

function ComboBadge({ combo }: { combo: ComboState }) {
  if (combo.count < 3) return null;
  return (
    <div className="memory-combo" aria-live="polite">
      <Zap aria-hidden="true" />
      <span>
        {formatNumber(combo.count)} متتالية ×{formatNumber(combo.multiplier)}
      </span>
    </div>
  );
}

function StagePill({ level }: { level: number }) {
  const stage = getStage(level);
  const Icon = stage.icon;
  return (
    <div className="memory-stage" style={{ '--stage-color': stage.color } as React.CSSProperties}>
      <Icon aria-hidden="true" />
      <span>{stage.label}</span>
    </div>
  );
}

function PreviewSequence({ sequence, activeIndex }: { sequence: number[]; activeIndex: number }) {
  const symbolIndex = sequence[activeIndex];
  const symbol = MEMORY_SYMBOL_BANK[symbolIndex];
  const progress = sequence.length > 0 ? (activeIndex + 1) / sequence.length : 0;

  return (
    <div className="memory-preview-wrap">
      <div
        className="memory-preview-progress"
        style={{ '--preview-progress': progress } as React.CSSProperties}
      />
      <div
        className="memory-preview"
        aria-live="polite"
        aria-label={`الومضة ${formatNumber(activeIndex + 1)} من ${formatNumber(sequence.length)}`}
      >
        <span
          key={`${symbolIndex}-${activeIndex}`}
          className="memory-preview-chip"
          data-testid="memory-active-symbol"
          style={{ '--symbol-color': symbol?.color } as React.CSSProperties}
        >
          {symbol?.value}
        </span>
      </div>
      <span className="memory-preview-counter" aria-hidden="true">
        {formatNumber(activeIndex + 1)} / {formatNumber(sequence.length)}
      </span>
    </div>
  );
}

function GameSummary({
  score,
  sequence,
  highScore,
  mode,
  bestStage,
  onRestart,
  onModeChange,
}: {
  score: number;
  sequence: number[];
  highScore: number;
  mode: 'solo' | 'versus';
  bestStage: string;
  onRestart: () => void;
  onModeChange: () => void;
}) {
  const isNewRecord = score > highScore;
  const displayedHighScore = Math.max(score, highScore);

  return (
    <div className="instant-intro memory-summary" role="status">
      <div className="memory-summary-header">
        {isNewRecord ? (
          <Trophy aria-hidden="true" className="memory-summary-trophy" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
        <h2>{isNewRecord ? 'رقم قياسي جديد!' : 'انتهت الجولة'}</h2>
      </div>

      <div className="memory-summary-grid">
        <div className="memory-summary-card">
          <span>الرصيد</span>
          <strong>{formatNumber(score)}</strong>
        </div>
        <div className="memory-summary-card">
          <span>أطول تسلسل</span>
          <strong>{formatNumber(sequence.length)}</strong>
        </div>
        <div className="memory-summary-card">
          <span>أفضل مرحلة</span>
          <strong style={{ color: getStage(sequence.length).color }}>{bestStage}</strong>
        </div>
        <div className="memory-summary-card">
          <span>الرقم القياسي</span>
          <strong>{formatNumber(displayedHighScore)}</strong>
        </div>
      </div>

      <div className="instant-actions">
        <Button variant="gold" size="lg" onClick={onRestart}>
          <RotateCcw aria-hidden="true" />
          {mode === 'versus' ? 'جولة جديدة' : 'العب مرة أخرى'}
        </Button>
        {mode === 'versus' && (
          <Button variant="outline" size="lg" onClick={onModeChange}>
            <Users aria-hidden="true" />
            وضع لاعب منفرد
          </Button>
        )}
      </div>
    </div>
  );
}

export function MemoryFlash() {
  const [difficulty, setDifficulty] = useState<MemoryDifficulty>('medium');
  const [mode, setMode] = useState<'solo' | 'versus'>('solo');
  const [sequence, setSequence] = useState<number[]>([]);
  const [inputIndex, setInputIndex] = useState(0);
  const [preview, setPreview] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [combo, setCombo] = useState<ComboState>({ count: 0, multiplier: 1 });
  const [mistakeSymbol, setMistakeSymbol] = useState<number | null>(null);
  const [correctSymbol, setCorrectSymbol] = useState<number | null>(null);
  const [pendingNextRound, setPendingNextRound] = useState(false);
  const [screen, setScreen] = useState<'setup' | 'play' | 'summary'>('setup');
  const [highScore, setCurrentHighScore] = useState(() => getHighScore('medium'));

  const settings: MemorySettings = useMemo(() => MEMORY_DIFFICULTIES[difficulty], [difficulty]);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    if (nextRoundTimerRef.current) window.clearTimeout(nextRoundTimerRef.current);
    if (countdownRef.current) window.clearInterval(countdownRef.current);
    previewTimerRef.current = null;
    nextRoundTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const resetState = useCallback(
    (keepDifficulty = true) => {
      clearTimers();
      if (!keepDifficulty) {
        setDifficulty('medium');
        setMode('solo');
      }
      setSequence([]);
      setInputIndex(0);
      setPreview(false);
      setPreviewIndex(0);
      setLives(settings.startingLives);
      setScore(0);
      setSeconds(settings.totalSeconds);
      setPaused(false);
      setCombo({ count: 0, multiplier: 1 });
      setMistakeSymbol(null);
      setCorrectSymbol(null);
      setPendingNextRound(false);
    },
    [clearTimers, settings],
  );

  const startGame = useCallback(() => {
    resetState(true);
    setCurrentHighScore(getHighScore(difficulty));
    setStarted(true);
    setScreen('play');
    setLives(settings.startingLives);
    setSeconds(settings.totalSeconds);
    setSequence([]);
    setInputIndex(0);
    setScore(0);
    setCombo({ count: 0, multiplier: 1 });
    setMistakeSymbol(null);
    setCorrectSymbol(null);
    setPendingNextRound(false);

    previewTimerRef.current = window.setTimeout(() => {
      setSequence((current) => [...current, Math.floor(Math.random() * MEMORY_SYMBOL_BANK.length)]);
      setInputIndex(0);
      setPreviewIndex(0);
      setPreview(true);
    }, 0) as unknown as ReturnType<typeof setTimeout>;
  }, [difficulty, resetState, settings]);

  useEffect(() => {
    if (!preview || paused || sequence.length === 0) return;
    const stepDuration = Math.max(
      220,
      settings.previewBaseMs - Math.max(0, sequence.length - 1) * settings.previewStepMs,
    );
    previewTimerRef.current = window.setTimeout(() => {
      if (previewIndex + 1 >= sequence.length) {
        setPreview(false);
        setPreviewIndex(0);
        return;
      }
      setPreviewIndex((value) => value + 1);
    }, stepDuration) as unknown as ReturnType<typeof setTimeout>;

    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, [paused, preview, previewIndex, sequence.length, settings]);

  useEffect(() => {
    if (!pendingNextRound || paused || screen !== 'play') return;
    nextRoundTimerRef.current = window.setTimeout(() => {
      setPendingNextRound(false);
      setSequence((current) => [...current, Math.floor(Math.random() * MEMORY_SYMBOL_BANK.length)]);
      setInputIndex(0);
      setPreviewIndex(0);
      setPreview(true);
    }, 300) as unknown as ReturnType<typeof setTimeout>;

    return () => {
      if (nextRoundTimerRef.current) window.clearTimeout(nextRoundTimerRef.current);
    };
  }, [paused, pendingNextRound, screen]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useEffect(() => {
    if (!started || screen !== 'play' || paused || preview || pendingNextRound) return;
    if (seconds <= 0 || lives <= 0) {
      clearTimers();
      const finalScore = score;
      if (finalScore > highScore) {
        setHighScore(difficulty, finalScore);
      }
      finishedRef.current = true;
    }
  }, [
    clearTimers,
    difficulty,
    highScore,
    lives,
    paused,
    pendingNextRound,
    preview,
    score,
    seconds,
    screen,
    started,
  ]);

  useEffect(() => {
    if (finishedRef.current) {
      finishedRef.current = false;
      setScreen('summary');
    }
  }, [screen, started, paused, lives, seconds]);

  useEffect(() => {
    if (!started || screen !== 'play' || paused || preview || pendingNextRound) return;
    countdownRef.current = window.setInterval(() => {
      setSeconds((value) => Math.max(0, value - 1));
    }, 1000) as unknown as ReturnType<typeof setInterval>;

    return () => {
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, [paused, pendingNextRound, preview, screen, seconds, started]);

  const choose = useCallback(
    (symbolIndex: number) => {
      if (preview || !started || screen !== 'play' || paused) return;

      if (sequence[inputIndex] !== symbolIndex) {
        setMistakeSymbol(symbolIndex);
        setCorrectSymbol(null);
        setCombo({ count: 0, multiplier: 1 });

        const nextLives = lives - 1;
        setLives(nextLives);
        setInputIndex(0);

        if (nextLives > 0) {
          setPreviewIndex(0);
          setPreview(true);
        }
        return;
      }

      setCorrectSymbol(symbolIndex);
      setMistakeSymbol(null);

      const newCombo = {
        count: combo.count + 1,
        multiplier: Math.min(4, 2 + Math.floor(combo.count / 4)),
      };
      setCombo(newCombo);

      const points = settings.pointsPerSymbol * newCombo.multiplier;
      setScore((value) => value + points);

      if (inputIndex + 1 === sequence.length) {
        setPreview(false);
        setInputIndex(0);
        setMistakeSymbol(null);
        setCorrectSymbol(null);

        setPendingNextRound(true);
      } else {
        setInputIndex((value) => value + 1);
      }
    },
    [
      combo.count,
      inputIndex,
      lives,
      paused,
      preview,
      screen,
      sequence,
      settings.pointsPerSymbol,
      started,
    ],
  );

  const togglePause = useCallback(() => {
    setPaused((value) => !value);
  }, []);

  const versusScore = mode === 'versus' ? highScore : 0;
  const bestStage = getStage(sequence.length).label;

  if (screen === 'setup') {
    return (
      <>
        <ScoreBar score={0} seconds={settings.totalSeconds} isPaused={false} />
        <Card className="instant-board memory-setup">
          <div className="memory-setup-hero">
            <Brain aria-hidden="true" />
            <h2>ومضة الذاكرة</h2>
            <p>احفظ التسلسل المتزايد، ثم أعد كتابته بأسرع ما يمكن.</p>
          </div>

          <div className="memory-setup-section">
            <h3>نمط اللعب</h3>
            <div className="memory-mode-grid" role="group" aria-label="أنماط اللعب">
              {(Object.keys(MEMORY_MODE_META) as Array<MemorySettings['mode']>).map((key) => {
                const meta = MEMORY_MODE_META[key];
                const active = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`memory-mode-card ${active ? 'is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setMode(key)}
                  >
                    {key === 'solo' ? <Brain aria-hidden="true" /> : <Users aria-hidden="true" />}
                    <strong>{meta.label}</strong>
                    <span>{meta.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="memory-setup-section">
            <h3>مستوى الصعوبة</h3>
            <div className="memory-difficulty-grid" role="group" aria-label="مستويات الصعوبة">
              {(Object.keys(MEMORY_DIFFICULTIES) as MemoryDifficulty[]).map((key) => {
                const item = MEMORY_DIFFICULTIES[key];
                const active = difficulty === key;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`memory-difficulty-card ${active ? 'is-active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setDifficulty(key)}
                  >
                    <strong>{item.label}</strong>
                    <span>{formatNumber(item.pointsPerSymbol)} نقطة / رمز</span>
                    <small>
                      {formatNumber(item.startingLives)} قلوب • {formatNumber(item.totalSeconds)}{' '}
                      ثانية
                    </small>
                  </button>
                );
              })}
            </div>
          </div>

          <Button variant="gold" size="lg" onClick={startGame}>
            <Play aria-hidden="true" />
            ابدأ التحدّي
          </Button>
        </Card>
      </>
    );
  }

  if (screen === 'summary') {
    return (
      <>
        <ScoreBar score={score} seconds={seconds} isPaused={false} />
        <Card className="instant-board">
          <GameSummary
            score={score}
            sequence={sequence}
            highScore={highScore}
            mode={mode}
            bestStage={bestStage}
            onRestart={startGame}
            onModeChange={() => {
              resetState(false);
              setScreen('setup');
            }}
          />
        </Card>
      </>
    );
  }

  const versusActive = mode === 'versus';

  return (
    <>
      <ScoreBar score={score} seconds={seconds} isPaused={paused} />
      <Card className="instant-board">
        <div className="memory-progress">
          <span>
            المستوى {formatNumber(sequence.length)} • {getStage(sequence.length).label}
          </span>
          <span className="memory-lives" aria-label={`المحاولات المتبقية: ${formatNumber(lives)}`}>
            {'●'.repeat(Math.max(0, lives))}
            <span className="memory-lives-empty">
              {'○'.repeat(Math.max(0, settings.startingLives - lives))}
            </span>
          </span>
        </div>

        {versusActive && (
          <div className="memory-versus-bar">
            <div className="memory-versus-player">
              <span>أنت</span>
              <strong>{formatNumber(score)}</strong>
            </div>
            <div className="memory-versus-divider" aria-hidden="true">
              <span>ضد</span>
            </div>
            <div className="memory-versus-player">
              <span>رقمك</span>
              <strong>{formatNumber(versusScore)}</strong>
            </div>
          </div>
        )}

        <StagePill level={sequence.length} />
        <ComboBadge combo={combo} />

        {preview ? (
          <PreviewSequence sequence={sequence} activeIndex={previewIndex} />
        ) : (
          <p className="memory-prompt" aria-live="polite">
            {paused
              ? 'إيقاف مؤقت'
              : `أعد التسلسل — بقي ${formatNumber(sequence.length - inputIndex)}`}
          </p>
        )}

        {!paused && (
          <div className="memory-pad" role="group" aria-label="أزرار الرموز">
            {MEMORY_SYMBOL_BANK.map((symbol, index) => {
              const isActivePreviewFlash = preview && sequence[previewIndex] === index;
              return (
                <button
                  type="button"
                  key={symbol.label}
                  aria-label={symbol.label}
                  disabled={preview || !started || screen !== 'play'}
                  onClick={() => choose(index)}
                  className={`
                    memory-chip
                    ${preview ? 'is-preview' : ''}
                    ${isActivePreviewFlash ? 'is-active-flash' : ''}
                    ${mistakeSymbol === index ? 'is-mistake' : ''}
                    ${correctSymbol === index ? 'is-correct' : ''}
                  `}
                  style={{ '--symbol-color': symbol.color } as React.CSSProperties}
                >
                  <span className="memory-chip-glow" aria-hidden="true" />
                  <span className="memory-chip-symbol">{symbol.value}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="instant-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={togglePause}
            disabled={!started || screen !== 'play'}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? 'استمرار' : 'إيقاف مؤقت'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearTimers();
              if (score > highScore) setHighScore(difficulty, score);
              setScreen('summary');
            }}
          >
            <ArrowRight aria-hidden="true" />
            خروج
          </Button>
        </div>
      </Card>
    </>
  );
}

function WordCode() {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(60);
  const [started, setStarted] = useState(false);
  const [message, setMessage] = useState('');
  const puzzle = WORD_CODE_BANK[index % WORD_CODE_BANK.length]!;

  const reset = () => {
    setIndex(0);
    setAnswer('');
    setScore(0);
    setSeconds(60);
    setMessage('');
    setStarted(true);
  };

  useEffect(() => {
    if (!started || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds, started]);

  const next = useCallback(() => {
    setIndex((value) => value + 1);
    setAnswer('');
  }, []);

  const submit = () => {
    if (answer.trim() === puzzle.word) {
      setScore((value) => value + 100);
      setMessage('إجابة صحيحة! +100');
      window.setTimeout(() => {
        setMessage('');
        next();
      }, 450);
      return;
    }
    setMessage('ليست الشفرة الصحيحة، حاول مرة أخرى.');
  };

  const finished = started && seconds === 0;

  return (
    <>
      <ScoreBar score={score} seconds={seconds} isPaused={false} />
      <Card className="instant-board">
        {!started ? (
          <div className="instant-intro">
            <Lightbulb aria-hidden="true" />
            <h2>فكّ أكبر عدد من الشفرات</h2>
            <p>رتّب الحروف العربية وفق التلميح. كل كلمة صحيحة تمنحك مئة نقطة.</p>
            <Button variant="gold" size="lg" onClick={reset}>
              ابدأ التحدّي
            </Button>
          </div>
        ) : finished ? (
          <div className="instant-intro" role="status">
            <Check aria-hidden="true" />
            <h2>رصيدك {formatNumber(score)} نقطة</h2>
            <p>حللت {formatNumber(score / 100)} شفرات خلال دقيقة.</p>
            <Button variant="gold" size="lg" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              جولة جديدة
            </Button>
          </div>
        ) : (
          <form
            className="word-code"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <span className="word-code__hint">
              <Lightbulb aria-hidden="true" />
              {puzzle.hint}
            </span>
            <strong className="word-code__scramble" aria-label={`الحروف: ${puzzle.scrambled}`}>
              {puzzle.scrambled}
            </strong>
            <label htmlFor="word-code-answer">اكتب الكلمة الصحيحة</label>
            <input
              id="word-code-answer"
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value.slice(0, 20));
                setMessage('');
              }}
              autoComplete="off"
              autoFocus
            />
            <p className="word-code__message" aria-live="polite">
              {message}
            </p>
            <div className="instant-actions">
              <Button type="submit" variant="gold" disabled={!answer.trim()}>
                تحقق
              </Button>
              <Button type="button" variant="outline" onClick={next}>
                تخطّ الكلمة
              </Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}

const QUESTION_WORD_RANK_POINTS = [1000, 850, 700] as const;
const QUESTION_WORD_ROOM_CODE = '739421';
export const QUESTION_WORD_STORAGE_KEY = 'tahaddi.question-word.room.739421';
type QuestionWordAssist = 'reveal' | 'remove' | 'first' | 'time' | 'hint';

function getQuestionWordScore(rank: number, elapsedSeconds: number) {
  if (rank <= QUESTION_WORD_RANK_POINTS.length) return QUESTION_WORD_RANK_POINTS[rank - 1]!;
  return Math.max(150, Math.round((700 * Math.max(0, 60 - elapsedSeconds)) / 60));
}

function QuestionWord() {
  const [screen, setScreen] = useState<'intro' | 'play' | 'summary' | 'final'>('intro');
  const [roundIndex, setRoundIndex] = useState(0);
  const [selectedTileIds, setSelectedTileIds] = useState<number[]>([]);
  const [revealedSlots, setRevealedSlots] = useState<number[]>([]);
  const [removedTileIds, setRemovedTileIds] = useState<number[]>([]);
  const [usedAssists, setUsedAssists] = useState<QuestionWordAssist[]>([]);
  const [showHint, setShowHint] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [score, setScore] = useState(0);
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [activePlayerIndex, setActivePlayerIndex] = useState(0);
  const [answeredPlayers, setAnsweredPlayers] = useState<string[]>([]);
  const [playerScores, setPlayerScores] = useState<Record<string, number>>({});
  const [roundMessage, setRoundMessage] = useState('');

  const round = QUESTION_WORD_BANK[roundIndex] ?? QUESTION_WORD_BANK[0]!;
  const answerLetters = useMemo(() => [...round.answer], [round.answer]);
  const revealedSet = useMemo(() => new Set(revealedSlots), [revealedSlots]);
  const pickedSet = useMemo(() => new Set(selectedTileIds), [selectedTileIds]);
  const removedSet = useMemo(() => new Set(removedTileIds), [removedTileIds]);

  const slots = useMemo(() => {
    let selectedCursor = 0;
    return answerLetters.map((letter, slotIndex) => {
      if (revealedSet.has(slotIndex)) return { letter, locked: true };
      const tileId = selectedTileIds[selectedCursor++];
      return { letter: tileId == null ? '' : (round.letters[tileId] ?? ''), locked: false };
    });
  }, [answerLetters, revealedSet, round.letters, selectedTileIds]);

  const progress =
    answerLetters.length === 0
      ? 0
      : slots.filter((slot) => slot.letter).length / answerLetters.length;
  const leaderboard = Object.entries(playerScores)
    .map(([name, value]) => ({ name, score: value }))
    .sort((a, b) => b.score - a.score);
  const activePlayer = players[activePlayerIndex] ?? players[0] ?? '';
  const playerRank = leaderboard.findIndex((player) => player.name === activePlayer) + 1 || 1;

  useEffect(() => {
    try {
      localStorage.setItem(
        QUESTION_WORD_STORAGE_KEY,
        JSON.stringify({
          players,
          playerScores,
          activePlayer,
          answeredPlayers,
          roundIndex,
          seconds,
          screen,
        }),
      );
    } catch {
      // The game remains playable when browser storage is unavailable.
    }
  }, [activePlayer, answeredPlayers, playerScores, players, roundIndex, screen, seconds]);

  const resetRound = useCallback((nextIndex = 0) => {
    setRoundIndex(nextIndex);
    setActivePlayerIndex(0);
    setAnsweredPlayers([]);
    setSelectedTileIds([]);
    setRevealedSlots([]);
    setRemovedTileIds([]);
    setUsedAssists([]);
    setShowHint(false);
    setSeconds(60);
    setRoundMessage('');
  }, []);

  const finishRound = useCallback(
    (correct: boolean) => {
      const elapsed = 60 - seconds;
      const rank = answeredPlayers.length + 1;
      const gained = correct ? getQuestionWordScore(rank, elapsed) : 0;
      const nextScores = correct
        ? { ...playerScores, [activePlayer]: (playerScores[activePlayer] ?? 0) + gained }
        : playerScores;
      const nextAnswered = correct ? [...answeredPlayers, activePlayer] : players;

      setScore(Math.max(0, ...Object.values(nextScores)));
      setPlayerScores(nextScores);
      setRoundMessage(
        correct
          ? `${activePlayer} · المركز ${formatNumber(rank)} · +${formatNumber(gained)}`
          : `انتهى الوقت · الإجابة ${round.answer}`,
      );
      if (nextAnswered.length >= players.length || !correct) {
        setAnsweredPlayers(nextAnswered);
        setScreen(roundIndex + 1 >= QUESTION_WORD_BANK.length ? 'final' : 'summary');
        return;
      }

      const nextPlayerIndex = players.findIndex((player) => !nextAnswered.includes(player));
      setAnsweredPlayers(nextAnswered);
      setActivePlayerIndex(nextPlayerIndex >= 0 ? nextPlayerIndex : 0);
      setSelectedTileIds([]);
      setRevealedSlots([]);
      setRemovedTileIds([]);
      setUsedAssists([]);
      setShowHint(false);
    },
    [activePlayer, answeredPlayers, playerScores, players, round.answer, roundIndex, seconds],
  );

  useEffect(() => {
    if (screen !== 'play') return;
    const timer = window.setTimeout(
      () => (seconds <= 1 ? finishRound(false) : setSeconds(seconds - 1)),
      seconds <= 0 ? 0 : 1000,
    );
    return () => window.clearTimeout(timer);
  }, [finishRound, screen, seconds]);

  const startMatch = () => {
    if (players.length < 2) return;
    setScore(0);
    setPlayerScores(Object.fromEntries(players.map((name) => [name, 0])));
    resetRound(0);
    setScreen('play');
    window.requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>('.question-word__hud')
        ?.scrollIntoView?.({ block: 'start' }),
    );
  };

  const addPlayer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanName = playerName.trim().slice(0, 24);
    if (cleanName.length < 2 || players.includes(cleanName) || players.length >= 12) return;
    setPlayers((current) => [...current, cleanName]);
    setPlayerScores((current) => ({ ...current, [cleanName]: 0 }));
    setPlayerName('');
  };

  const chooseLetter = (tileId: number) => {
    if (pickedSet.has(tileId) || removedSet.has(tileId) || progress >= 1) return;
    const next = [...selectedTileIds, tileId];
    let selectedCursor = 0;
    const nextWord = answerLetters
      .map((letter, slotIndex) => {
        if (revealedSet.has(slotIndex)) return letter;
        const nextTile = next[selectedCursor++];
        return nextTile == null ? '' : (round.letters[nextTile] ?? '');
      })
      .join('');

    setSelectedTileIds(next);
    if (nextWord === round.answer) finishRound(true);
  };

  const deleteLast = () => setSelectedTileIds((current) => current.slice(0, -1));

  const revealSlot = (slotIndex: number, assist: QuestionWordAssist) => {
    const selectedPosition = answerLetters
      .slice(0, slotIndex)
      .filter((_, index) => !revealedSet.has(index)).length;
    setSelectedTileIds((current) => current.filter((_, index) => index !== selectedPosition));
    setRevealedSlots((current) => [...new Set([...current, slotIndex])]);
    setUsedAssists((current) => [...current, assist]);
  };

  const applyAssist = (assist: QuestionWordAssist) => {
    if (usedAssists.includes(assist)) return;
    if (assist === 'hint') {
      setShowHint(true);
      setUsedAssists((current) => [...current, assist]);
      return;
    }
    if (assist === 'time') {
      setSeconds((value) => Math.min(65, value + 5));
      setUsedAssists((current) => [...current, assist]);
      return;
    }
    if (assist === 'remove') {
      const wrongTile = round.letters.findIndex(
        (letter, index) =>
          !answerLetters.includes(letter) && !pickedSet.has(index) && !removedSet.has(index),
      );
      if (wrongTile >= 0) setRemovedTileIds((current) => [...current, wrongTile]);
      setUsedAssists((current) => [...current, assist]);
      return;
    }
    const slotIndex =
      assist === 'first'
        ? 0
        : slots.findIndex(
            (slot, index) => !revealedSet.has(index) && slot.letter !== answerLetters[index],
          );
    if (slotIndex >= 0) revealSlot(slotIndex, assist);
  };

  if (screen === 'intro') {
    return (
      <>
        <ScoreBar score={0} seconds={60} isPaused={false} />
        <Card className="instant-board question-word-intro">
          <div className="instant-intro">
            <HelpCircle aria-hidden="true" />
            <span className="question-word__eyebrow">معاينة جماعية سريعة</span>
            <h2>سؤال واحد، كلمة واحدة، أسرع إصبع يفوز</h2>
            <p>
              ركّب الإجابة من الحروف المبعثرة. كل جولة دقيقة واحدة، والمركز الأسرع يأخذ أعلى نقاط.
            </p>
            <div className="question-word__rules" aria-label="قواعد المباراة">
              <span>١٠ أسئلة</span>
              <span>٦٠ ثانية</span>
              <span>Top 3</span>
            </div>
            <div className="question-word__lobby" aria-label="دخول اللاعبين">
              <div className="question-word__room-code">
                <span>رمز الدخول الجماعي</span>
                <strong dir="ltr">{QUESTION_WORD_ROOM_CODE}</strong>
                <small>يدخل اللاعبون بهذا الرقم ثم تبدأ المنافسة</small>
              </div>
              <form className="question-word__join" onSubmit={addPlayer}>
                <label htmlFor="question-word-player">اسم اللاعب</label>
                <div>
                  <input
                    id="question-word-player"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    placeholder="مثال: أحمد"
                    maxLength={24}
                    autoComplete="nickname"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={playerName.trim().length < 2 || players.length >= 12}
                  >
                    دخول
                  </Button>
                </div>
              </form>
              <ol className="question-word__players">
                {players.length === 0 ? (
                  <li data-empty>
                    <span>٠</span>
                    <strong>بانتظار أول لاعب</strong>
                  </li>
                ) : (
                  players.map((player, index) => (
                    <li key={player}>
                      <span>{formatNumber(index + 1)}</span>
                      <strong>{player}</strong>
                    </li>
                  ))
                )}
              </ol>
              <p className="question-word__lobby-status" aria-live="polite">
                {players.length < 2
                  ? 'أضف لاعبين اثنين على الأقل لبدء المنافسة.'
                  : `${formatNumber(players.length)} لاعبين جاهزون.`}
              </p>
              <div className="question-word__lobby-links">
                <NextLink
                  className="button button-outline button-md"
                  href="/games/question-word/host"
                >
                  <Gauge aria-hidden="true" />
                  شاشة المضيف
                </NextLink>
                <NextLink
                  className="button button-ghost button-md"
                  href="/questions?game=QUESTION_WORD"
                >
                  <Brain aria-hidden="true" />
                  بنك أسئلة اللعبة
                </NextLink>
              </div>
              <Button variant="gold" size="lg" onClick={startMatch} disabled={players.length < 2}>
                <Play aria-hidden="true" />
                ابدأ المنافسة
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (screen === 'summary' || screen === 'final') {
    const topPlayers = leaderboard.slice(0, 3);
    return (
      <>
        <ScoreBar score={score} seconds={screen === 'final' ? 0 : seconds} isPaused={false} />
        <Card className="instant-board question-word-summary">
          <div className="instant-intro" role="status">
            {screen === 'final' ? <Trophy aria-hidden="true" /> : <Medal aria-hidden="true" />}
            <h2>{screen === 'final' ? 'منصة كلمة وسؤال' : 'ترتيب الجولة'}</h2>
            <p>{roundMessage}</p>
            {screen === 'final' ? (
              <WinnerPodium
                winners={topPlayers.map((player) => ({
                  name: player.name,
                  initials: player.name.slice(0, 2),
                  score: player.score,
                }))}
              />
            ) : (
              <ol className="question-word__podium">
                {topPlayers.map((player, index) => (
                  <li key={player.name} data-rank={index + 1}>
                    <span>{formatNumber(index + 1)}</span>
                    <strong>{player.name}</strong>
                    <b>{formatNumber(player.score)} نقطة</b>
                  </li>
                ))}
              </ol>
            )}
            {screen === 'final' ? (
              <Button variant="gold" size="lg" onClick={startMatch}>
                <RotateCcw aria-hidden="true" />
                مباراة جديدة
              </Button>
            ) : (
              <Button
                variant="gold"
                size="lg"
                onClick={() => {
                  resetRound(roundIndex + 1);
                  setScreen('play');
                  window.requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>('.question-word__hud')
                      ?.scrollIntoView?.({ block: 'start' }),
                  );
                }}
              >
                السؤال التالي
              </Button>
            )}
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <ScoreBar score={score} seconds={seconds} isPaused={false} />
      <Card className="instant-board question-word-board">
        <div className="question-word__hud" aria-label="حالة كلمة وسؤال">
          <span>غرفة {QUESTION_WORD_ROOM_CODE}</span>
          <span>
            السؤال {formatNumber(roundIndex + 1)} / {formatNumber(QUESTION_WORD_BANK.length)}
          </span>
          <span data-ending={seconds <= 10 || undefined}>باقي {formatNumber(seconds)} ثانية</span>
          <span>دور اللاعب {activePlayer}</span>
          <span>
            أجابوا {formatNumber(answeredPlayers.length)} / {formatNumber(players.length)}
          </span>
        </div>

        <div className="question-word__stage">
          <span className="question-word__eyebrow">السؤال الحالي</span>
          <h2>{round.question}</h2>
          <div className="question-word__active-player" aria-label="اللاعب الحالي">
            <Users aria-hidden="true" />
            <span>اللاعب الآن</span>
            <strong>{activePlayer}</strong>
            <b>المركز {formatNumber(playerRank)}</b>
          </div>
          <div
            className="question-word__slots"
            aria-label={`خانات الإجابة: ${formatNumber(answerLetters.length)}`}
          >
            {slots.map((slot, index) => (
              <span key={`${round.answer}-${index}`} data-locked={slot.locked || undefined}>
                {slot.letter}
              </span>
            ))}
          </div>
          <div className="question-word__progress" aria-hidden="true">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="question-word__turn" aria-live="polite">
            {roundMessage ||
              `ركّب الإجابة الآن يا ${activePlayer}. ترتيبك الحالي ${formatNumber(playerRank)}.`}
          </p>
          {showHint && <p className="question-word__hint">{round.hint}</p>}
        </div>

        <div className="question-word__letters" role="group" aria-label="الحروف المتاحة">
          {round.letters.map((letter, index) => (
            <button
              type="button"
              key={`${letter}-${index}`}
              disabled={pickedSet.has(index) || removedSet.has(index)}
              aria-label={`اختر حرف ${letter}`}
              onClick={() => chooseLetter(index)}
            >
              {letter}
            </button>
          ))}
        </div>

        <div className="question-word__actions">
          <Button
            type="button"
            variant="outline"
            onClick={deleteLast}
            disabled={selectedTileIds.length === 0}
          >
            <Eraser aria-hidden="true" />
            حذف آخر حرف
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyAssist('reveal')}
            disabled={usedAssists.includes('reveal')}
          >
            <Eye aria-hidden="true" />
            كشف حرف
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyAssist('remove')}
            disabled={usedAssists.includes('remove')}
          >
            <ShieldCheck aria-hidden="true" />
            حذف حرف خاطئ
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyAssist('first')}
            disabled={usedAssists.includes('first')}
          >
            <Pin aria-hidden="true" />
            تثبيت أول حرف
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyAssist('time')}
            disabled={usedAssists.includes('time')}
          >
            <TimerReset aria-hidden="true" />
            +٥ ثوانٍ
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => applyAssist('hint')}
            disabled={usedAssists.includes('hint')}
          >
            <Lightbulb aria-hidden="true" />
            تلميح
          </Button>
        </div>

        <aside className="question-word__leaderboard" aria-label="ترتيب اللاعبين">
          <strong>أفضل اللاعبين الآن</strong>
          <ol>
            {leaderboard.slice(0, 4).map((player, index) => (
              <li key={player.name} data-current={player.name === activePlayer || undefined}>
                <span>{formatNumber(index + 1)}</span>
                <b>{player.name}</b>
                <em>{formatNumber(player.score)}</em>
              </li>
            ))}
          </ol>
        </aside>
      </Card>
    </>
  );
}

const COLOR_BLIND_KEY = 'tahaddi.color-rush.color-blind';

function readColorBlindPreference(): boolean {
  try {
    return localStorage.getItem(COLOR_BLIND_KEY) === '1';
  } catch {
    return false;
  }
}

const colorBlindListeners = new Set<() => void>();

function subscribeColorBlind(listener: () => void) {
  colorBlindListeners.add(listener);
  return () => {
    colorBlindListeners.delete(listener);
  };
}

function writeColorBlindPreference(value: boolean) {
  try {
    localStorage.setItem(COLOR_BLIND_KEY, value ? '1' : '0');
  } catch {
    // ignore storage errors
  }
  colorBlindListeners.forEach((listener) => listener());
}

const COLOR_RUSH_PRACTICE_ATTEMPTS = 5;
const COLOR_RUSH_FEEDBACK_MS = 420;

type ColorRushRound = { wordIndex: number; inkIndex: number };

function createColorRushRound(previous?: ColorRushRound): ColorRushRound {
  const count = COLOR_RUSH_BANK.length;
  const wordIndex = Math.floor(Math.random() * count);
  let inkIndex = Math.floor(Math.random() * count);

  if (inkIndex === wordIndex) inkIndex = (inkIndex + 1) % count;

  if (previous && previous.wordIndex === wordIndex && previous.inkIndex === inkIndex) {
    inkIndex = (inkIndex + 1) % count;
    if (inkIndex === wordIndex) inkIndex = (inkIndex + 1) % count;
  }

  return { wordIndex, inkIndex };
}

function ColorRush() {
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(45);
  const [started, setStarted] = useState(false);
  const [practice, setPractice] = useState(false);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [locked, setLocked] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [selectedColor, setSelectedColor] = useState<number | null>(null);
  const [activeRound, setActiveRound] = useState<ColorRushRound>({ wordIndex: 0, inkIndex: 1 });
  const [lastReactionMs, setLastReactionMs] = useState<number | null>(null);
  const [totalReactionMs, setTotalReactionMs] = useState(0);
  // Initialise the ref to null so we don't call Date.now() during render.
  // The first `resetRound` call (or any explicit `now()` call below) fills it
  // in, which keeps React 19's purity rule happy in strict-mode renders.
  const roundStartTimeRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorBlind = useSyncExternalStore(
    subscribeColorBlind,
    readColorBlindPreference,
    () => false,
  );
  const { wordIndex, inkIndex } = activeRound;
  const accuracy = attempts === 0 ? 0 : Math.round((correctAnswers / attempts) * 100);
  const avgReactionMs = correctAnswers === 0 ? 0 : Math.round(totalReactionMs / correctAnswers);

  const toggleColorBlind = () => {
    writeColorBlindPreference(!colorBlind);
  };

  const resetRound = (isPractice: boolean) => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    setRound(0);
    setScore(0);
    setSeconds(45);
    setMessage('');
    setFeedback(null);
    setLocked(false);
    setStreak(0);
    setBestStreak(0);
    setCorrectAnswers(0);
    setAttempts(0);
    setSelectedColor(null);
    setLastReactionMs(null);
    setTotalReactionMs(0);
    setActiveRound(createColorRushRound());
    setPractice(isPractice);
    setStarted(true);
    roundStartTimeRef.current = getNow();
  };

  const start = () => resetRound(false);

  const startPractice = () => resetRound(true);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!started || practice || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [started, practice, seconds]);

  const choose = (index: number) => {
    if (locked) return;
    // Seed the ref if it has not been set yet, then compute the reaction
    // time. The `Date.now()` calls live strictly inside this event handler,
    // never during render — wrapping them in `getNow()` keeps the React 19
    // purity rule happy while still giving us millisecond-accurate timing.
    if (roundStartTimeRef.current === null) {
      roundStartTimeRef.current = getNow();
    }
    const reactionTime = Math.max(50, getNow() - roundStartTimeRef.current);
    const isCorrect = index === inkIndex;
    const nextRound = round + 1;

    setLocked(true);
    setSelectedColor(index);
    setAttempts((value) => value + 1);

    if (isCorrect) {
      const nextStreak = streak + 1;
      setLastReactionMs(reactionTime);
      setTotalReactionMs((prev) => prev + reactionTime);
      setMessage('إجابة صحيحة');
      setFeedback('correct');
      setCorrectAnswers((value) => value + 1);
      setStreak(nextStreak);
      setBestStreak((value) => Math.max(value, nextStreak));
      if (!practice) {
        setScore((value) => value + 75);
      }
    } else {
      setMessage('الإجابة الصحيحة: ' + COLOR_RUSH_BANK[inkIndex]?.label);
      setFeedback('wrong');
      setStreak(0);
      if (!practice) setScore((value) => Math.max(0, value - 25));
    }

    setRound(nextRound);
    if (practice && nextRound >= COLOR_RUSH_PRACTICE_ATTEMPTS) {
      setLocked(false);
      return;
    }

    feedbackTimerRef.current = window.setTimeout(() => {
      setActiveRound((current) => createColorRushRound(current));
      setMessage('');
      setFeedback(null);
      setSelectedColor(null);
      setLocked(false);
      roundStartTimeRef.current = Date.now();
    }, COLOR_RUSH_FEEDBACK_MS) as unknown as ReturnType<typeof setTimeout>;
  };

  const finished = started && !practice && seconds === 0;
  const practiceDone = started && practice && round >= COLOR_RUSH_PRACTICE_ATTEMPTS;

  return (
    <>
      <ScoreBar score={score} seconds={seconds} isPaused={false} practice={started && practice} />
      <Card className="instant-board">
        {!started ? (
          <div className="instant-intro color-rush-intro">
            <Focus aria-hidden="true" />
            <span className="color-rush-intro__eyebrow">اختبار ستروب للتركيز وسرعة البديهة</span>
            <h2>لا تثق بما تقرأه</h2>
            <p>
              اختر لون الحبر الظاهر، وتجاهل معنى الكلمة. أمامك 45 ثانية لتحقيق أعلى رصيد وسرعة
              استجابة.
            </p>
            <div className="instant-actions">
              <Button variant="gold" size="lg" onClick={start}>
                ابدأ التحدّي
              </Button>
              <Button variant="outline" size="lg" onClick={startPractice}>
                جولة تدريبية
              </Button>
            </div>
            <button
              type="button"
              className="color-rush__cb-toggle"
              aria-pressed={colorBlind}
              onClick={toggleColorBlind}
            >
              {colorBlind ? 'إخفاء رموز الألوان' : 'وضع عمى الألوان: إظهار رموز مميزة'}
            </button>
          </div>
        ) : finished ? (
          <div className="instant-intro color-rush-summary" role="status">
            <Check aria-hidden="true" />
            <h2>جمعت {formatNumber(score)} نقطة</h2>
            <div className="color-rush-summary__stats">
              <span>
                الدقة <strong>{formatNumber(accuracy)}٪</strong>
              </span>
              <span>
                أفضل سلسلة <strong>{formatNumber(bestStreak)}</strong>
              </span>
              <span>
                الجولات <strong>{formatNumber(round)}</strong>
              </span>
              {avgReactionMs > 0 && (
                <span>
                  متوسط السرعة <strong>{formatNumber(avgReactionMs)} ms</strong>
                </span>
              )}
            </div>
            <Button variant="gold" size="lg" onClick={start}>
              <RotateCcw aria-hidden="true" />
              تحدٍّ جديد
            </Button>
          </div>
        ) : practiceDone ? (
          <div className="instant-intro" role="status">
            <Check aria-hidden="true" />
            <h2>انتهى التدريب!</h2>
            <p>فهمت الفكرة؟ حان وقت التحدّي الحقيقي مع المؤقّت والنقاط وسرعة البديهة.</p>
            <div className="instant-actions">
              <Button variant="gold" size="lg" onClick={start}>
                ابدأ التحدّي
              </Button>
              <Button variant="outline" size="lg" onClick={startPractice}>
                <RotateCcw aria-hidden="true" />
                تدريب من جديد
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="color-rush"
            data-color-blind={colorBlind || undefined}
            data-feedback={feedback ?? undefined}
          >
            <div className="color-rush__hud" aria-label="إحصاءات الجولة">
              <span>
                <Gauge aria-hidden="true" /> الجولة {formatNumber(round + 1)}
              </span>
              <span>الدقة {formatNumber(accuracy)}٪</span>
              <span>سلسلة {formatNumber(streak)}</span>
              {lastReactionMs ? (
                <span>
                  <Zap aria-hidden="true" /> {formatNumber(lastReactionMs)} ms
                </span>
              ) : (
                <span>
                  <Flame aria-hidden="true" /> سريع
                </span>
              )}
            </div>
            {practice ? (
              <span className="color-rush__practice" role="status">
                تدريب بلا وقت ولا نقاط — المحاولة {formatNumber(round + 1)} من{' '}
                {formatNumber(COLOR_RUSH_PRACTICE_ATTEMPTS)}
              </span>
            ) : null}
            <div className="color-rush__arena">
              <span>ما لون الحبر؟</span>
              <strong style={{ color: COLOR_RUSH_BANK[inkIndex]?.value }}>
                {colorBlind ? (
                  <span
                    className="color-rush__ink-symbol"
                    aria-label={`رمز الحبر: ${COLOR_RUSH_BANK[inkIndex]?.symbolLabel}`}
                  >
                    {COLOR_RUSH_BANK[inkIndex]?.symbol}
                  </span>
                ) : null}
                {COLOR_RUSH_BANK[wordIndex]?.label}
              </strong>
              <p aria-live="polite" role="status">
                {message || 'اختر بسرعة، ولا تقرأ الكلمة'}
              </p>
            </div>
            <div className="color-rush__options" role="group" aria-label="خيارات الألوان">
              {COLOR_RUSH_BANK.map((color, index) => (
                <button
                  type="button"
                  key={color.label}
                  disabled={locked}
                  data-answer={
                    feedback && index === inkIndex
                      ? 'correct'
                      : feedback === 'wrong' && index === selectedColor
                        ? 'wrong'
                        : feedback
                          ? 'muted'
                          : undefined
                  }
                  style={{ '--rush-color': color.value } as React.CSSProperties}
                  onClick={() => choose(index)}
                >
                  <span className="color-rush__swatch" aria-hidden="true" />
                  <span className="color-rush__option-symbol" aria-hidden="true">
                    {color.symbol}
                  </span>
                  <strong>{color.label}</strong>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="color-rush__cb-toggle"
              aria-pressed={colorBlind}
              onClick={toggleColorBlind}
            >
              {colorBlind ? 'إخفاء رموز الألوان' : 'وضع عمى الألوان: إظهار رموز مميزة'}
            </button>
          </div>
        )}
      </Card>
    </>
  );
}

const SPOT_DIFF_SECONDS = 60;
const SPOT_DIFF_FOUND_POINTS = 100;
const SPOT_DIFF_ROUND_BONUS = 150;
const SPOT_DIFF_WRONG_PENALTY = 20;
const SPOT_DIFF_MAX_HINTS = 3;
const SPOT_DIFF_HIGH_SCORE_KEY = 'tahaddi.spot-difference.high-score';

function getSpotHighScore(): number {
  try {
    const raw = localStorage.getItem(SPOT_DIFF_HIGH_SCORE_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function setSpotHighScore(value: number) {
  try {
    localStorage.setItem(SPOT_DIFF_HIGH_SCORE_KEY, String(value));
  } catch {
    // ignore storage errors
  }
}

function shuffleList<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function spotCellKey(r: number, c: number): string {
  return `${r}-${c}`;
}

function spotSceneCell(
  scene: SpotDifferenceScene,
  flipped: boolean,
  r: number,
  c: number,
): string {
  if (!flipped) return scene.rows[r]?.[c] ?? '';
  const diff = scene.diffs.find((entry) => entry.r === r && entry.c === c);
  return diff ? diff.with : (scene.rows[r]?.[c] ?? '');
}

function SpotDifferenceSceneBoard({
  scene,
  flipped,
  label,
  foundKeys,
  hintKey,
  revealedKeys,
  wrongKey,
  onPick,
}: {
  scene: SpotDifferenceScene;
  flipped: boolean;
  label: string;
  foundKeys: Set<string>;
  hintKey: string | null;
  revealedKeys: Set<string>;
  wrongKey: string | null;
  onPick: (r: number, c: number) => void;
}) {
  return (
    <div className="spotdiff-scene" aria-label={label}>
      <span className="spotdiff-scene-label">{label}</span>
      <div className="spotdiff-grid">
        {scene.rows.map((row, r) =>
          row.map((_, c) => {
            const key = spotCellKey(r, c);
            return (
              <button
                type="button"
                key={key}
                data-testid={`spot-cell-${flipped ? 'b' : 'a'}-${r}-${c}`}
                data-found={foundKeys.has(key) || undefined}
                data-hint={hintKey === key || undefined}
                data-revealed={revealedKeys.has(key) || undefined}
                data-wrong={wrongKey === key || undefined}
                aria-label={`الموضع صف ${formatNumber(r + 1)} عمود ${formatNumber(c + 1)}`}
                onClick={() => onPick(r, c)}
              >
                {spotSceneCell(scene, flipped, r, c)}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function SpotDifference() {
  const [screen, setScreen] = useState<'setup' | 'play' | 'summary'>('setup');
  const [sceneOrder, setSceneOrder] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [found, setFound] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(SPOT_DIFF_SECONDS);
  const [roundName, setRoundName] = useState('تحدّي اختلاف الصور');
  const [roundSeconds, setRoundSeconds] = useState(SPOT_DIFF_SECONDS);
  const [sceneCount, setSceneCount] = useState(3);
  const [maxMistakes, setMaxMistakes] = useState(5);
  const [mistakes, setMistakes] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wrongKey, setWrongKey] = useState<string | null>(null);
  const [hintKey, setHintKey] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<string[]>([]);
  const [hintsLeft, setHintsLeft] = useState(SPOT_DIFF_MAX_HINTS);
  const [message, setMessage] = useState('');
  const [totalFound, setTotalFound] = useState(0);
  const [highScore, setCurrentHighScore] = useState(() => getSpotHighScore());

  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (wrongTimerRef.current) window.clearTimeout(wrongTimerRef.current);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    wrongTimerRef.current = null;
    hintTimerRef.current = null;
    revealTimerRef.current = null;
    advanceTimerRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const sceneIndex = sceneOrder.length > 0 ? (sceneOrder[round % sceneOrder.length] ?? 0) : 0;
  const scene = SPOT_DIFFERENCE_SCENES[sceneIndex] ?? SPOT_DIFFERENCE_SCENES[0]!;
  const foundSet = useMemo(() => new Set(found), [found]);
  const revealedSet = useMemo(() => new Set(revealedKeys), [revealedKeys]);
  const complete = foundSet.size >= scene.diffs.length;

  const startGame = useCallback(() => {
    clearTimers();
    finishedRef.current = false;
    setCurrentHighScore(getSpotHighScore());
    setSceneOrder(shuffleList([...SPOT_DIFFERENCE_SCENES.keys()]).slice(0, sceneCount));
    setRound(0);
    setFound([]);
    setScore(0);
    setSeconds(roundSeconds);
    setMistakes(0);
    setPaused(false);
    setWrongKey(null);
    setHintKey(null);
    setRevealedKeys([]);
    setHintsLeft(SPOT_DIFF_MAX_HINTS);
    setMessage('');
    setTotalFound(0);
    setStarted(true);
    setScreen('play');
  }, [clearTimers, roundSeconds, sceneCount]);

  useEffect(() => {
    if (!started || screen !== 'play' || paused || seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [paused, screen, seconds, started]);

  useEffect(() => {
    if (!started || screen !== 'play' || seconds > 0 || paused) return;
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimers();
    setSpotHighScore(Math.max(getSpotHighScore(), score));
    setScreen('summary');
  }, [clearTimers, paused, score, screen, seconds, started]);

  useEffect(() => {
    if (!started || screen !== 'play' || mistakes < maxMistakes || finishedRef.current) return;
    finishedRef.current = true;
    clearTimers();
    setSpotHighScore(Math.max(getSpotHighScore(), score));
    setScreen('summary');
  }, [clearTimers, maxMistakes, mistakes, score, screen, started]);

  const pick = useCallback(
    (r: number, c: number) => {
      if (screen !== 'play' || paused || advanceTimerRef.current) return;
      const key = spotCellKey(r, c);
      if (foundSet.has(key)) return;

      if (scene.diffs.some((entry) => entry.r === r && entry.c === c)) {
        const nextFound = [...found, key];
        setFound(nextFound);
        setTotalFound((value) => value + 1);
        setScore((value) => value + SPOT_DIFF_FOUND_POINTS);
        setMessage('فرق صحيح! +١٠٠');
        setWrongKey(null);
        setRevealedKeys([]);

        if (nextFound.length >= scene.diffs.length) {
          setScore((value) => value + SPOT_DIFF_ROUND_BONUS);
          setMessage('اكتمل المشهد! مكافأة ١٥٠ نقطة');
          advanceTimerRef.current = window.setTimeout(() => {
            advanceTimerRef.current = null;
            setRound((value) => value + 1);
            setFound([]);
            setRevealedKeys([]);
            setMessage('');
          }, 900) as unknown as ReturnType<typeof setTimeout>;
        }
        return;
      }

      setWrongKey(key);
      setMistakes((value) => value + 1);
      setScore((value) => Math.max(0, value - SPOT_DIFF_WRONG_PENALTY));
      setMessage(`موضع خاطئ −${formatNumber(SPOT_DIFF_WRONG_PENALTY)}`);
      wrongTimerRef.current = window.setTimeout(() => {
        wrongTimerRef.current = null;
        setWrongKey(null);
      }, 400) as unknown as ReturnType<typeof setTimeout>;
    },
    [found, foundSet, paused, scene, screen],
  );

  const useHint = useCallback(() => {
    if (screen !== 'play' || hintsLeft <= 0 || advanceTimerRef.current) return;
    const unfound = scene.diffs.filter(
      (entry) => !foundSet.has(spotCellKey(entry.r, entry.c)),
    );
    if (unfound.length === 0) return;
    const target = unfound[Math.floor(Math.random() * unfound.length)]!;
    const key = spotCellKey(target.r, target.c);
    setHintsLeft((value) => value - 1);
    setHintKey(key);
    setMessage('انظر إلى الموضع الوامض');
    hintTimerRef.current = window.setTimeout(() => {
      hintTimerRef.current = null;
      setHintKey(null);
    }, 1400) as unknown as ReturnType<typeof setTimeout>;
  }, [foundSet, hintsLeft, scene, screen]);

  const revealDifferences = useCallback(() => {
    if (screen !== 'play' || complete || advanceTimerRef.current) return;
    const keys = scene.diffs
      .filter((entry) => !foundSet.has(spotCellKey(entry.r, entry.c)))
      .map((entry) => spotCellKey(entry.r, entry.c));
    setRevealedKeys(keys);
    setMessage('تم إظهار الفروق المتبقية مؤقتًا');
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      setRevealedKeys([]);
    }, 2_000) as unknown as ReturnType<typeof setTimeout>;
  }, [complete, foundSet, scene, screen]);

  const nextScene = useCallback(() => {
    if (screen !== 'play' || advanceTimerRef.current) return;
    setRound((value) => value + 1);
    setFound([]);
    setHintKey(null);
    setRevealedKeys([]);
    setWrongKey(null);
    setMessage('صورة جديدة جاهزة للبحث');
  }, [screen]);

  const exitToSummary = useCallback(() => {
    clearTimers();
    setSpotHighScore(Math.max(getSpotHighScore(), score));
    setScreen('summary');
  }, [clearTimers, score]);

  if (screen === 'setup') {
    return (
      <>
        <ScoreBar score={0} seconds={roundSeconds} isPaused={false} />
        <Card className="instant-board spotdiff-setup">
          <div className="instant-intro">
            <ScanSearch aria-hidden="true" />
            <h2>عين صقر أم عين مشتّتة؟</h2>
            <p>
              مشهدان متطابقان ظاهريًا يظهران معًا. اضغط مواضع الفروق الخمسة في أي نسخة قبل أن
              ينتهي الوقت.
            </p>
            <fieldset className="spotdiff-config">
              <legend>إعداد الجولة</legend>
              <label>
                اسم الجولة
                <input
                  aria-label="اسم الجولة"
                  maxLength={48}
                  value={roundName}
                  onChange={(event) => setRoundName(event.target.value)}
                />
              </label>
              <label>
                الوقت لكل صورة
                <select
                  aria-label="الوقت لكل صورة"
                  value={roundSeconds}
                  onChange={(event) => setRoundSeconds(Number(event.target.value))}
                >
                  <option value={60}>٦٠ ثانية</option>
                  <option value={90}>٩٠ ثانية</option>
                  <option value={120}>١٢٠ ثانية</option>
                </select>
              </label>
              <label>
                عدد الصور
                <select
                  aria-label="عدد الصور"
                  value={sceneCount}
                  onChange={(event) => setSceneCount(Number(event.target.value))}
                >
                  <option value={1}>صورة واحدة</option>
                  <option value={3}>٣ صور</option>
                  <option value={SPOT_DIFFERENCE_SCENES.length}>كل الصور</option>
                </select>
              </label>
              <label>
                حد الأخطاء
                <select
                  aria-label="حد الأخطاء"
                  value={maxMistakes}
                  onChange={(event) => setMaxMistakes(Number(event.target.value))}
                >
                  <option value={3}>٣ أخطاء</option>
                  <option value={5}>٥ أخطاء</option>
                  <option value={7}>٧ أخطاء</option>
                </select>
              </label>
            </fieldset>
            <div className="spotdiff-rules" aria-label="قواعد اللعبة">
              <span>٥ فروق لكل مشهد</span>
              <span>{formatNumber(roundSeconds)} ثانية</span>
              <span>٣ تلميحات</span>
            </div>
            <Button variant="gold" size="lg" onClick={startGame}>
              <Play aria-hidden="true" />
              ابدأ التحدّي
            </Button>
          </div>
        </Card>
      </>
    );
  }

  if (screen === 'summary') {
    const isNewRecord = score > highScore;
    return (
      <>
        <ScoreBar score={score} seconds={0} isPaused={false} />
        <Card className="instant-board">
          <div className="instant-intro" role="status">
            {isNewRecord ? <Trophy aria-hidden="true" /> : <Medal aria-hidden="true" />}
            <h2>{isNewRecord ? 'رقم قياسي جديد!' : 'انتهى الوقت'}</h2>
            <p>
              اكتشفت {formatNumber(totalFound)} فرقًا وأكملت {formatNumber(round)} مشاهد.
            </p>
            <div className="memory-summary-grid">
              <div className="memory-summary-card">
                <span>الرصيد</span>
                <strong>{formatNumber(score)}</strong>
              </div>
              <div className="memory-summary-card">
                <span>فروق مكتشفة</span>
                <strong>{formatNumber(totalFound)}</strong>
              </div>
              <div className="memory-summary-card">
                <span>الرقم القياسي</span>
                <strong>{formatNumber(Math.max(score, highScore))}</strong>
              </div>
            </div>
            <Button variant="gold" size="lg" onClick={startGame}>
              <RotateCcw aria-hidden="true" />
              تحدٍّ جديد
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <ScoreBar score={score} seconds={seconds} isPaused={paused} />
      <Card className="instant-board spotdiff-board">
        <div className="spotdiff-hud" aria-label="حالة المشاهد">
          <span>
            المشهد {formatNumber(round + 1)} • {roundName.trim() || 'تحدّي اختلاف الصور'} • {scene.title}
          </span>
          <span>
            الفروق {formatNumber(foundSet.size)} / {formatNumber(scene.diffs.length)}
          </span>
          <span>
            تلميحات {formatNumber(hintsLeft)}
          </span>
          <span>
            الأخطاء {formatNumber(mistakes)} / {formatNumber(maxMistakes)}
          </span>
        </div>

        <div className="spotdiff-stages">
          <SpotDifferenceSceneBoard
            scene={scene}
            flipped={false}
            label="الصورة الأولى"
            foundKeys={foundSet}
            hintKey={hintKey}
            revealedKeys={revealedSet}
            wrongKey={wrongKey}
            onPick={pick}
          />
          <SpotDifferenceSceneBoard
            scene={scene}
            flipped={true}
            label="الصورة الثانية"
            foundKeys={foundSet}
            hintKey={hintKey}
            revealedKeys={revealedSet}
            wrongKey={wrongKey}
            onPick={pick}
          />
        </div>

        <p className="spotdiff-message" aria-live="polite">
          {message || (paused ? 'إيقاف مؤقت' : 'اضغط أي فرق تكتشفه في أيّ من الصورتين')}
        </p>

        <div className="instant-actions">
          <Button type="button" variant="ghost" size="sm" onClick={nextScene}>
            <RotateCcw aria-hidden="true" />
            صورة جديدة
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={revealDifferences}
            disabled={complete}
          >
            <Eye aria-hidden="true" />
            إظهار الفروق
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={useHint}
            disabled={hintsLeft <= 0 || complete}
          >
            <Lightbulb aria-hidden="true" />
            تلميح
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? 'استمرار' : 'إيقاف مؤقت'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={exitToSummary}>
            <ArrowRight aria-hidden="true" />
            خروج
          </Button>
        </div>
      </Card>
    </>
  );
}

const SCRAMBLED_SECONDS = 60;
const SCRAMBLED_WORD_POINTS = 100;
const SCRAMBLED_ROUND_BONUS = 150;
const SCRAMBLED_WRONG_PENALTY = 10;
const SCRAMBLED_MAX_HINTS = 3;
const SCRAMBLED_HIGH_SCORE_KEY = 'tahaddi.scrambled-words.high-score';

function getScrambledHighScore(): number {
  try {
    const raw = localStorage.getItem(SCRAMBLED_HIGH_SCORE_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function setScrambledHighScore(value: number) {
  try {
    localStorage.setItem(SCRAMBLED_HIGH_SCORE_KEY, String(value));
  } catch {
    // ignore storage errors
  }
}

function ScrambledWords() {
  const [screen, setScreen] = useState<'setup' | 'play' | 'summary'>('setup');
  const [roundIndex, setRoundIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [built, setBuilt] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(SCRAMBLED_SECONDS);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState('');
  const [shake, setShake] = useState(false);
  const [hintsLeft, setHintsLeft] = useState(SCRAMBLED_MAX_HINTS);
  const [roundsDone, setRoundsDone] = useState(0);
  const [highScore, setCurrentHighScore] = useState(() => getScrambledHighScore());

  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);

  const round = SCRAMBLED_WORDS_ROUNDS[roundIndex % SCRAMBLED_WORDS_ROUNDS.length]!;
  const targetWord = round.words[Math.min(wordIndex, round.words.length - 1)]!;
  const builtLetters = built.map((index) => round.letters[index] ?? '');

  const clearFeedbackTimer = useCallback(() => {
    if (shakeTimerRef.current) window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = null;
  }, []);

  const startGame = useCallback(() => {
    finishedRef.current = false;
    setCurrentHighScore(getScrambledHighScore());
    setRoundIndex(0);
    setWordIndex(0);
    setBuilt([]);
    setScore(0);
    setSeconds(SCRAMBLED_SECONDS);
    setPaused(false);
    setMessage('');
    setShake(false);
    setHintsLeft(SCRAMBLED_MAX_HINTS);
    setRoundsDone(0);
    setStarted(true);
    setScreen('play');
  }, []);

  useEffect(() => {
    if (!started || screen !== 'play' || paused || seconds > 0) return;
    if (finishedRef.current) return;
    finishedRef.current = true;
    setScrambledHighScore(Math.max(getScrambledHighScore(), score));
    setScreen('summary');
  }, [paused, score, screen, seconds, started]);

  useEffect(() => {
    if (!started || paused || screen !== 'play') return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [paused, screen, started]);

  const tapLetter = useCallback(
    (poolIndex: number) => {
      if (screen !== 'play' || paused) return;
      clearFeedbackTimer();
      if (built.includes(poolIndex)) return;

      const nextBuilt = [...built, poolIndex];
      const nextWord = nextBuilt.map((index) => round.letters[index] ?? '').join('');

      if (nextWord === targetWord) {
        setScore((value) => value + SCRAMBLED_WORD_POINTS);
        setBuilt([]);
        setMessage(`كلمة صحيحة! +${formatNumber(SCRAMBLED_WORD_POINTS)}`);

        if (wordIndex + 1 >= round.words.length) {
          setScore((value) => value + SCRAMBLED_ROUND_BONUS);
          setRoundsDone((value) => value + 1);
          setRoundIndex((value) => value + 1);
          setWordIndex(0);
          setMessage('أُنجزت اللوحة! مكافأة ١٥٠ نقطة');
        } else {
          setWordIndex(wordIndex + 1);
        }
        return;
      }

      if (nextWord.length >= targetWord.length) {
        setBuilt([]);
        setShake(true);
        setScore((value) => Math.max(0, value - SCRAMBLED_WRONG_PENALTY));
        setMessage('ترتيب غير صحيح، حاول مجددًا');
        shakeTimerRef.current = window.setTimeout(() => {
          shakeTimerRef.current = null;
          setShake(false);
        }, 450) as unknown as ReturnType<typeof setTimeout>;
        return;
      }

      setBuilt(nextBuilt);
    },
    [built, clearFeedbackTimer, paused, round.letters, round.words.length, screen, targetWord, wordIndex],
  );

  const undoLast = useCallback(() => {
    if (screen !== 'play' || paused) return;
    clearFeedbackTimer();
    setBuilt((current) => current.slice(0, -1));
  }, [clearFeedbackTimer, paused, screen]);

  const useHint = useCallback(() => {
    if (screen !== 'play' || paused || hintsLeft <= 0) return;
    const needed = targetWord[built.length];
    if (!needed) return;
    const poolIndex = round.letters.findIndex(
      (letter, index) => letter === needed && !built.includes(index),
    );
    if (poolIndex < 0) return;
    clearFeedbackTimer();
    setHintsLeft((value) => value - 1);
    setScore((value) => Math.max(0, value - SCRAMBLED_WRONG_PENALTY));
    setBuilt((current) => [...current, poolIndex]);
  }, [built, clearFeedbackTimer, hintsLeft, paused, round.letters, screen, targetWord]);

  const exitToSummary = useCallback(() => {
    setScrambledHighScore(Math.max(getScrambledHighScore(), score));
    setScreen('summary');
  }, [score]);

  if (screen === 'setup') {
    return (
      <>
        <ScoreBar score={0} seconds={SCRAMBLED_SECONDS} isPaused={false} />
        <Card className="instant-board scrambled-setup">
          <div className="instant-intro">
            <Puzzle aria-hidden="true" />
            <h2>ركّب الكلمات المفككة</h2>
            <p>
              لكل لوحة صورة وتلميح وثلاث كلمات مبعثرة الحروف. اضغط الفقاعات بالترتيب الصحيح قبل أن
              ينتهي الوقت.
            </p>
            <div className="scrambled-rules" aria-label="قواعد اللعبة">
              <span>٣ كلمات لكل لوحة</span>
              <span>٦٠ ثانية</span>
              <span>٣ تلميحات</span>
            </div>
            <Button variant="gold" size="lg" onClick={startGame}>
              <Play aria-hidden="true" />
              ابدأ التحدّي
            </Button>
          </div>
        </Card>
      </>
    );
  }

  if (screen === 'summary') {
    const isNewRecord = score > highScore;
    return (
      <>
        <ScoreBar score={score} seconds={0} isPaused={false} />
        <Card className="instant-board">
          <div className="instant-intro" role="status">
            {isNewRecord ? <Trophy aria-hidden="true" /> : <Medal aria-hidden="true" />}
            <h2>{isNewRecord ? 'رقم قياسي جديد!' : 'انتهى الوقت'}</h2>
            <p>أكملت {formatNumber(roundsDone)} لوحات كاملة برصيد {formatNumber(score)} نقطة.</p>
            <div className="memory-summary-grid">
              <div className="memory-summary-card">
                <span>الرصيد</span>
                <strong>{formatNumber(score)}</strong>
              </div>
              <div className="memory-summary-card">
                <span>لوحات مكتملة</span>
                <strong>{formatNumber(roundsDone)}</strong>
              </div>
              <div className="memory-summary-card">
                <span>الرقم القياسي</span>
                <strong>{formatNumber(Math.max(score, highScore))}</strong>
              </div>
            </div>
            <Button variant="gold" size="lg" onClick={startGame}>
              <RotateCcw aria-hidden="true" />
              جولة جديدة
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const usedSet = new Set(built);

  return (
    <>
      <ScoreBar score={score} seconds={seconds} isPaused={paused} />
      <Card className="instant-board scrambled-board">
        <div className="scrambled-hud" aria-label="حالة الكلمات">
          <span>
            اللوحة {formatNumber(roundIndex + 1)}
          </span>
          <span>
            الكلمة {formatNumber(Math.min(wordIndex + 1, round.words.length))} /{' '}
            {formatNumber(round.words.length)}
          </span>
          <span>تلميحات {formatNumber(hintsLeft)}</span>
        </div>

        <div className="scrambled-picture" aria-label={`الصورة: ${round.hint}`}>
          <span className="scrambled-picture-emoji" aria-hidden="true">
            {round.picture}
          </span>
          <strong>{round.hint}</strong>
        </div>

        <div className="scrambled-words" aria-label="كلمات اللوحة">
          {round.words.map((word, index) => {
            if (index < wordIndex) {
              return (
                <span key={`${word}-${index}`} className="scrambled-word" data-locked>
                  <Check aria-hidden="true" />
                  {word}
                </span>
              );
            }
            if (index === wordIndex) {
              return (
                <span
                  key={`${word}-${index}`}
                  className={`scrambled-word ${shake ? 'is-shake' : ''}`}
                  data-active
                  aria-label={`الكلمة الحالية بطول ${formatNumber(word.length)} حروف`}
                >
                  {builtLetters.map((letter, slot) => (
                    <b key={slot}>{letter || '·'}</b>
                  ))}
                </span>
              );
            }
            return (
              <span key={`${word}-${index}`} className="scrambled-word" data-hidden>
                {'·'.repeat(word.length)}
              </span>
            );
          })}
        </div>

        <p className="scrambled-message" aria-live="polite">
          {message || 'اضغط الحروف بالترتيب الصحيح'}
        </p>

        <div className="scrambled-pool" role="group" aria-label="فقاعات الحروف">
          {round.letters.map((letter, index) => (
            <button
              type="button"
              key={`${letter}-${index}`}
              disabled={usedSet.has(index)}
              aria-label={`اختر حرف ${letter}`}
              onClick={() => tapLetter(index)}
            >
              {letter}
            </button>
          ))}
        </div>

        <div className="instant-actions">
          <Button type="button" variant="outline" onClick={undoLast} disabled={built.length === 0}>
            <Undo2 aria-hidden="true" />
            تراجع
          </Button>
          <Button type="button" variant="ghost" onClick={useHint} disabled={hintsLeft <= 0}>
            <Lightbulb aria-hidden="true" />
            تلميح
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? 'استمرار' : 'إيقاف مؤقت'}
          </Button>
          <Button type="button" variant="ghost" onClick={exitToSummary}>
            <ArrowRight aria-hidden="true" />
            خروج
          </Button>
        </div>
      </Card>
    </>
  );
}

const RISK_DEFAULT_PLAYER_NAMES = [
  'اللاعب الأول',
  'اللاعب الثاني',
  'اللاعب الثالث',
  'اللاعب الرابع',
  'اللاعب الخامس',
  'اللاعب السادس',
  'اللاعب السابع',
  'اللاعب الثامن',
] as const;

type RiskPlayer = {
  name: string;
  score: number;
  bombs: number;
  cashouts: number;
  bestPot: number;
};

type RiskMatch = {
  players: RiskPlayer[];
  deck: Array<RiskCard & { revealed: boolean }>;
  difficulty: RiskDifficulty;
  totalRounds: number;
  round: number;
  currentPlayer: number;
  turnsPlayed: number;
  pot: number;
  shield: boolean;
  doubleNext: boolean;
  awaitingDecision: boolean;
  lastCardId: string | null;
  message: string;
  finished: boolean;
};

function riskCardLabel(card: RiskCard) {
  if (card.kind === 'bomb') return 'قنبلة';
  if (card.kind === 'shield') return 'درع حماية';
  if (card.kind === 'double') return 'مضاعفة البطاقة التالية';
  if (card.kind === 'treasure') return `كنز ${formatNumber(card.value)} نقطة`;
  return `${formatNumber(card.value)} نقطة`;
}

function RiskMark({ kind }: { kind: RiskCard['kind'] | 'back' }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {kind === 'back' ? (
        <path d="M32 7 53 19v26L32 57 11 45V19Zm0 11-12 7v14l12 7 12-7V25Z" />
      ) : kind === 'bomb' ? (
        <path d="M39 17c3-6 8-8 14-8l2 7c-5 0-8 1-10 5l-6-4Zm-7 2a19 19 0 1 1-13 5l-5-5 7-7 6 6c2-1 3-1 5-1Z" />
      ) : kind === 'shield' ? (
        <path d="M32 6 53 14v17c0 13-8 22-21 27C19 53 11 44 11 31V14Zm0 12-11 4v9c0 7 4 12 11 16 7-4 11-9 11-16v-9Z" />
      ) : kind === 'treasure' ? (
        <path d="M10 25h44v28H10Zm5-14h34l5 12H10Zm12 14h10v12H27Z" />
      ) : kind === 'double' ? (
        <path d="m12 17 9-9 11 11L43 8l9 9-11 11 11 11-9 9-11-11-11 11-9-9 11-11Z" />
      ) : (
        <path d="M32 6 39 23l18 2-14 12 5 18-16-9-16 9 5-18L7 25l18-2Z" />
      )}
    </svg>
  );
}

function RiskGame() {
  const [screen, setScreen] = useState<'setup' | 'board' | 'final'>('setup');
  const [playerCount, setPlayerCount] = useState(2);
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({});
  const [difficulty, setDifficulty] = useState<RiskDifficulty>('balanced');
  const [match, setMatch] = useState<RiskMatch | null>(null);
  const [seconds, setSeconds] = useState(30);

  const startGame = useCallback(() => {
    setMatch({
      players: Array.from({ length: playerCount }, (_, index) => ({
        name:
          playerNames[index]?.trim().slice(0, 24) || RISK_DEFAULT_PLAYER_NAMES[index]!,
        score: 0,
        bombs: 0,
        cashouts: 0,
        bestPot: 0,
      })),
      deck: buildRiskDeck(difficulty).map((card) => ({ ...card, revealed: false })),
      difficulty,
      totalRounds: 5,
      round: 1,
      currentPlayer: 0,
      turnsPlayed: 0,
      pot: 0,
      shield: false,
      doubleNext: false,
      awaitingDecision: false,
      lastCardId: null,
      message: 'اختر بطاقة مخفية وابدأ بحساب المجازفة.',
      finished: false,
    });
    setSeconds(30);
    setScreen('board');
  }, [difficulty, playerCount, playerNames]);

  const finishTurn = useCallback((cashOut: boolean, message?: string) => {
    setMatch((current) => {
      if (!current) return current;
      const players = current.players.map((player, index) =>
        index === current.currentPlayer
          ? {
              ...player,
              score: player.score + (cashOut ? current.pot : 0),
              bombs: player.bombs + (cashOut ? 0 : 1),
              cashouts: player.cashouts + (cashOut && current.pot > 0 ? 1 : 0),
              bestPot: Math.max(player.bestPot, cashOut ? current.pot : 0),
            }
          : player,
      );
      const completedRound = current.turnsPlayed + 1 >= players.length;
      const nextRound = completedRound ? current.round + 1 : current.round;
      if (nextRound > current.totalRounds) {
        return {
          ...current,
          players,
          pot: 0,
          message: message ?? 'اكتملت المباراة.',
          finished: true,
        };
      }
      const nextPlayer = completedRound
        ? current.round % players.length
        : (current.currentPlayer + 1) % players.length;
      return {
        ...current,
        players,
        deck: completedRound
          ? buildRiskDeck(current.difficulty).map((card) => ({ ...card, revealed: false }))
          : current.deck,
        round: nextRound,
        currentPlayer: nextPlayer,
        turnsPlayed: completedRound ? 0 : current.turnsPlayed + 1,
        pot: 0,
        shield: false,
        doubleNext: false,
        awaitingDecision: false,
        lastCardId: null,
        message:
          message ??
          (cashOut
            ? `حُفظ ${formatNumber(current.pot)} نقطة. الدور التالي يبدأ الآن.`
            : 'انفجرت القنبلة وضاع رصيد الدور فقط.'),
      };
    });
    setSeconds(30);
  }, []);

  const revealCard = useCallback(
    (cardId: string) => {
      if (!match || match.awaitingDecision) return;
      const card = match.deck.find((candidate) => candidate.id === cardId);
      if (!card || card.revealed) return;
      const deck = match.deck.map((candidate) =>
        candidate.id === cardId ? { ...candidate, revealed: true } : candidate,
      );
      if (card.kind === 'bomb' && !match.shield) {
        setMatch({ ...match, deck, lastCardId: card.id });
        finishTurn(false);
        return;
      }
      const reward = card.kind === 'points' || card.kind === 'treasure' ? card.value : 0;
      const earned = reward * (match.doubleNext ? 2 : 1);
      setMatch({
        ...match,
        deck,
        pot: match.pot + earned,
        shield: card.kind === 'shield' || (match.shield && card.kind !== 'bomb'),
        doubleNext: card.kind === 'double' ? true : reward > 0 ? false : match.doubleNext,
        awaitingDecision: true,
        lastCardId: card.id,
        message:
          card.kind === 'bomb'
            ? 'صدّ الدرع القنبلة واستهلكته.'
            : `ظهرت بطاقة ${riskCardLabel(card)}.`,
      });
      setSeconds(10);
    },
    [finishTurn, match],
  );

  useEffect(() => {
    if (screen !== 'board' || !match) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current > 1) return current - 1;
        window.clearInterval(timer);
        if (match.pot > 0) finishTurn(true, 'انتهى الوقت، فحُفظ رصيد الدور تلقائيًا.');
        else finishTurn(true, 'انتهى الوقت، وانتقل الدور تلقائيًا.');
        return 30;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finishTurn, match, screen]);

  const rankedPlayers = useMemo(
    () =>
      [...(match?.players ?? [])].sort(
        (a, b) =>
          b.score - a.score ||
          a.bombs - b.bombs ||
          b.cashouts - a.cashouts ||
          b.bestPot - a.bestPot,
      ),
    [match?.players],
  );

  if (screen === 'setup') {
    return (
      <>
        <Card className="instant-board risk-setup">
          <div className="instant-intro">
            <RiskMark kind="back" />
            <span className="risk-eyebrow">اكسب ما جمعت… أو اخسر رصيد الدور</span>
            <h2>إلى أي حد ستجازف؟</h2>
            <p>
              اكشف البطاقات واجمع رصيدًا مؤقتًا. اكتفِ لحفظه، أو واصل المجازفة مع احتمال ظهور
              القنبلة وضياع رصيد هذا الدور.
            </p>
            <div className="risk-count" role="group" aria-label="مستوى المجازفة">
              {(Object.keys(RISK_PRESETS) as RiskDifficulty[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`risk-count-chip ${difficulty === level ? 'is-active' : ''}`}
                  aria-pressed={difficulty === level}
                  onClick={() => setDifficulty(level)}
                >
                  {RISK_PRESETS[level].label} · {formatNumber(RISK_PRESETS[level].bombs)} قنابل
                </button>
              ))}
            </div>
            <div className="risk-count" role="group" aria-label="عدد اللاعبين">
              {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={`risk-count-chip ${playerCount === count ? 'is-active' : ''}`}
                  aria-pressed={playerCount === count}
                  onClick={() => setPlayerCount(count)}
                >
                  {formatNumber(count)}
                </button>
              ))}
            </div>
            <div className="risk-names" aria-label="أسماء اللاعبين">
              {Array.from({ length: playerCount }, (_, index) => (
                <div key={index} className="risk-name-field">
                  <label htmlFor={`risk-player-${index}`}>
                    {playerNames[index]?.trim() || RISK_DEFAULT_PLAYER_NAMES[index]!}
                  </label>
                  <input
                    id={`risk-player-${index}`}
                    value={playerNames[index] ?? ''}
                    onChange={(event) =>
                      setPlayerNames((current) => ({
                        ...current,
                        [index]: event.target.value.slice(0, 24),
                      }))
                    }
                    placeholder={RISK_DEFAULT_PLAYER_NAMES[index]!}
                    maxLength={24}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
            <Button variant="gold" size="lg" onClick={startGame}>
              <Play aria-hidden="true" />
              ابدأ المباراة
            </Button>
          </div>
        </Card>
      </>
    );
  }

  if (screen === 'final' || match?.finished) {
    const winners = rankedPlayers.slice(0, 3).map((player) => ({
      name: player.name,
      initials: player.name.slice(0, 2),
      score: player.score,
    }));
    return (
      <>
        <Card className="instant-board risk-final">
          <div className="instant-intro" role="status">
            <Crown aria-hidden="true" />
            <h2>منصة المجازفة</h2>
            <p>
              الفائز {rankedPlayers[0]?.name ?? '—'} برصيد{' '}
              {formatNumber(rankedPlayers[0]?.score ?? 0)} نقطة بعد خمس جولات.
            </p>
            <WinnerPodium winners={winners} />
            <div className="instant-actions">
              <Button variant="gold" size="lg" onClick={() => setScreen('setup')}>
                <RotateCcw aria-hidden="true" />
                مباراة جديدة
              </Button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (!match) return null;

  const activePlayer = match.players[match.currentPlayer]!;
  const revealedCount = match.deck.filter((card) => card.revealed).length;

  return (
    <>
      <Card className="instant-board risk-board">
        <div className="risk-hud" aria-label="حالة المجازفة">
          <span>الجولة {formatNumber(match.round)} / {formatNumber(match.totalRounds)}</span>
          <span data-current>الدور: {activePlayer.name}</span>
          <span>الوقت {formatNumber(seconds)}</span>
          <span>رصيد الدور {formatNumber(match.pot)}</span>
          <span>رصيدك {formatNumber(activePlayer.score)}</span>
          <span>المتبقي {formatNumber(match.deck.length - revealedCount)}</span>
          {match.shield ? <span>الدرع جاهز</span> : null}
          {match.doubleNext ? <span>البطاقة التالية ×٢</span> : null}
        </div>

        <div className="risk-teams" aria-label="لوحة اللاعبين">
          {match.players.map((player, index) => (
            <div
              key={`${player.name}-${index}`}
              className="risk-team"
              data-active={index === match.currentPlayer || undefined}
            >
              <strong>{player.name}</strong>
              <b>{formatNumber(player.score)}</b>
            </div>
          ))}
        </div>

        <div className="risk-dare" role="status" aria-live="polite">
          <p>{match.message}</p>
          {match.awaitingDecision ? (
            <div className="instant-actions">
              <Button variant="gold" onClick={() => finishTurn(true)} aria-label="اكتفِ واجمع الرصيد">
                <Check aria-hidden="true" />
                اكتفِ · +{formatNumber(match.pot)}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setMatch({ ...match, awaitingDecision: false, message: 'اختر بطاقة أخرى.' });
                  setSeconds(30);
                }}
                aria-label="جازف واختر بطاقة أخرى"
              >
                <Flame aria-hidden="true" />
                جازف
              </Button>
            </div>
          ) : null}
        </div>

        <div className="risk-grid" role="group" aria-label="خانات المجازفة">
          {match.deck.map((card) => (
            <button
              type="button"
              key={card.id}
              className="risk-card-3d"
              data-revealed={card.revealed || undefined}
              data-kind={card.revealed ? card.kind : undefined}
              aria-label={card.revealed ? riskCardLabel(card) : 'بطاقة مخفية'}
              disabled={card.revealed || match.awaitingDecision}
              onClick={() => revealCard(card.id)}
            >
              <span className="risk-card-3d__inner">
                <span className="risk-card-3d__face risk-card-3d__back">
                  <span className="risk-card-3d__seal">
                    <RiskMark kind="back" />
                  </span>
                  <strong className="risk-card-3d__brand">تحدّي</strong>
                  <small>المجازفة</small>
                </span>
                <span className="risk-card-3d__face risk-card-3d__front">
                  <RiskMark kind={card.kind} />
                  <b>{riskCardLabel(card)}</b>
                </span>
              </span>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

export function InstantGameRoom({ mode }: { mode: InstantGameMode }) {
  const meta = useMemo(() => INSTANT_GAME_META[mode], [mode]);

  return (
    <MotionScene scene="intro" sceneKey={`instant-${mode}`}>
      <section className="section instant-game" data-game={mode}>
        <div className="container instant-shell">
        <NextLink className="instant-back" href="/games" prefetch={false}>
          <ArrowRight aria-hidden="true" />
          كل الألعاب
        </NextLink>
        <header className="instant-head">
          <span>لعبة فورية — لا تحتاج حسابًا</span>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </header>
        {mode === 'memory-flash' ? (
          <MemoryFlash />
        ) : mode === 'word-code' ? (
          <WordCode />
        ) : mode === 'question-word' ? (
          <QuestionWord />
        ) : mode === 'baloot' ? (
          <BalootRoom />
        ) : mode === 'spot-difference' ? (
          <SpotDifference />
        ) : mode === 'scrambled-words' ? (
          <ScrambledWords />
        ) : mode === 'risk' ? (
          <RiskGame />
        ) : (
          <ColorRush />
        )}
        <GameHowTo guide={GAME_GUIDES[mode]} />
        </div>
      </section>
    </MotionScene>
  );
}
