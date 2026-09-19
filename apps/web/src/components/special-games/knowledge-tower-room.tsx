'use client';

import { Building2, Heart, RotateCcw, ShieldCheck, Sparkles, Timer, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui';
import { MotionScene } from '@/components/motion/motion-scene';
import { formatNumber } from '@/lib/utils';
import {
  buildKnowledgeTowerRun,
  getTowerSeconds,
  KNOWLEDGE_TOWER_CHECKPOINTS,
  KNOWLEDGE_TOWER_FLOORS,
  KNOWLEDGE_TOWER_LIVES,
  KNOWLEDGE_TOWER_POINTS,
  type KnowledgeTowerQuestion,
} from './knowledge-tower-bank';
import styles from './knowledge-tower-room.module.css';

type Phase = 'intro' | 'question' | 'reveal' | 'finished';
const optionLabels = ['أ', 'ب', 'ج', 'د'] as const;
const HIGH_SCORE_KEY = 'tahaddi.knowledge-tower.high-score';

function getSafeFloor(cleared: number) {
  if (cleared >= 12) return 12;
  if (cleared >= 8) return 8;
  if (cleared >= 4) return 4;
  return 0;
}

export function KnowledgeTowerRoom() {
  const [run, setRun] = useState<KnowledgeTowerQuestion[]>([]);
  const [floorIndex, setFloorIndex] = useState(0);
  const [lives, setLives] = useState(KNOWLEDGE_TOWER_LIVES);
  const [score, setScore] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [seconds, setSeconds] = useState(25);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try {
      return Number(window.localStorage.getItem(HIGH_SCORE_KEY) || 0);
    } catch {
      return 0;
    }
  });

  const current = run[floorIndex];
  const floorNumber = current?.floor ?? 1;
  const prize = KNOWLEDGE_TOWER_POINTS[Math.min(floorIndex, KNOWLEDGE_TOWER_POINTS.length - 1)] ?? 100;

  const resolveAnswer = (index: number) => {
    if (!current || phase !== 'question') return;
    setChoice(index);
    setPhase('reveal');
    const correct = index === current.answerIndex;
    if (correct) {
      const nextScore = score + prize;
      setScore(nextScore);
    } else {
      setLives((value) => value - 1);
    }
  };

  // React 19 "store information from previous renders" pattern: when the
  // current question or phase changes we want the timeout-driven auto-resolve
  // to call the latest `resolveAnswer`. We compare against the previous value
  // in render itself (allowed for derived state) and call `resolveAnswer`
  // synchronously during render. React 19 explicitly supports "set state
  // during render" — it will discard the current render and re-render with
  // the updated state. This avoids the `set-state-in-effect` warning while
  // keeping `resolveAnswer` (which itself calls setChoice/setPhase/...) out
  // of any asynchronous effect.
  const [prevAutoResolveKey, setPrevAutoResolveKey] = useState<string | null>(null);
  const autoResolveKey = current ? `${current.id}:${phase}:${seconds}:${choice}` : null;
  const shouldAutoResolve = autoResolveKey !== null
    && autoResolveKey !== prevAutoResolveKey
    && phase === 'question'
    && seconds === 0
    && choice === null;
  if (shouldAutoResolve) {
    setPrevAutoResolveKey(autoResolveKey);
    resolveAnswer(-1);
  }

  useEffect(() => {
    if (phase !== 'question') return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, floorIndex]);

  const startRun = () => {
    setRun(buildKnowledgeTowerRun());
    setFloorIndex(0);
    setLives(KNOWLEDGE_TOWER_LIVES);
    setScore(0);
    setChoice(null);
    setPhase('question');
    setSeconds(getTowerSeconds(1));
  };

  const continueAfterReveal = () => {
    if (!current) return;
    const correct = choice === current.answerIndex;
    if (!correct && lives <= 0) {
      finishRun(score);
      return;
    }
    if (floorIndex + 1 >= run.length) {
      finishRun(score);
      return;
    }
    const nextIndex = floorIndex + 1;
    setFloorIndex(nextIndex);
    setChoice(null);
    setPhase('question');
    setSeconds(getTowerSeconds(run[nextIndex]?.floor ?? nextIndex + 1));
  };

  const finishRun = (finalScore: number) => {
    setPhase('finished');
    try {
      const best = Math.max(finalScore, Number(localStorage.getItem(HIGH_SCORE_KEY) || 0));
      localStorage.setItem(HIGH_SCORE_KEY, String(best));
      setHighScore(best);
    } catch {
      setHighScore((value) => Math.max(value, finalScore));
    }
  };

  const cleared = phase === 'finished' ? (choice === current?.answerIndex ? floorIndex + 1 : floorIndex) : floorIndex;
  const safeFloor = getSafeFloor(cleared);
  const won = phase === 'finished' && lives > 0 && floorIndex >= KNOWLEDGE_TOWER_FLOORS - 1 && choice === current?.answerIndex;

  const towerFloors = useMemo(
    () => Array.from({ length: KNOWLEDGE_TOWER_FLOORS }, (_, index) => KNOWLEDGE_TOWER_FLOORS - index),
    [],
  );

  return (
    <MotionScene scene={phase} sceneKey={`${phase}-${floorIndex}`}>
      <section className={styles.room} dir="rtl">
        <div className={styles.shell}>
        <ButtonLink href="/games" variant="ghost" className={styles.back}>
          كل الألعاب
        </ButtonLink>

        {phase === 'intro' ? (
          <div className={styles.intro}>
            <span className={styles.kicker}>
              <Building2 /> لعبة تسلّق معرفية
            </span>
            <h1>برج المعرفة</h1>
            <p>
              اصعد اثني عشر طابقاً من الأسئلة العربية المتدرجة. ثلاث أرواح، محطات أمان في الطوابق 4 و8 و12،
              والوقت يضيق كلما ارتفعت.
            </p>
            <ul className={styles.rules}>
              <li>كل طابق سؤال واحد بأربع خيارات.</li>
              <li>الإجابة الخاطئة أو انتهاء الوقت تخصم روحاً.</li>
              <li>بلّغ القمة لتحصد 12,000 نقطة وتتصدّر برجك.</li>
            </ul>
            <div className={styles.introActions}>
              <Button type="button" onClick={startRun}>
                <Sparkles />
                ابدأ الصعود
              </Button>
              {highScore > 0 ? <small>أفضل رصيد: {formatNumber(highScore)}</small> : null}
            </div>
          </div>
        ) : (
          <div className={styles.board}>
            <aside className={styles.tower} aria-label="طوابق البرج">
              {towerFloors.map((floor) => (
                <div
                  key={floor}
                  className={styles.floor}
                  data-current={floor === floorNumber || undefined}
                  data-cleared={floor < floorNumber || (phase === 'finished' && won && floor <= 12) || undefined}
                  data-safe={KNOWLEDGE_TOWER_CHECKPOINTS.includes(floor as 4 | 8 | 12) || undefined}
                >
                  <span>{formatNumber(floor)}</span>
                  <strong>{formatNumber(KNOWLEDGE_TOWER_POINTS[floor - 1] ?? 0)}</strong>
                </div>
              ))}
            </aside>

            <div className={styles.stage}>
              <header className={styles.status}>
                <span>
                  <Building2 /> الطابق {formatNumber(floorNumber)} / {formatNumber(KNOWLEDGE_TOWER_FLOORS)}
                </span>
                <span>
                  <Trophy /> {formatNumber(score)}
                </span>
                <span data-ending={seconds <= 8 || undefined}>
                  <Timer /> {formatNumber(seconds)}ث
                </span>
                <span>
                  {Array.from({ length: KNOWLEDGE_TOWER_LIVES }).map((_, index) => (
                    <Heart
                      key={index}
                      fill={index < lives ? 'currentColor' : 'none'}
                      opacity={index < lives ? 1 : 0.35}
                      aria-hidden
                    />
                  ))}
                </span>
              </header>

              {phase === 'finished' ? (
                <div className={styles.finale}>
                  <h2>{won ? 'بلغت قمة البرج' : 'توقف الصعود'}</h2>
                  <p>
                    الرصيد النهائي {formatNumber(score)} · محطة الأمان {formatNumber(safeFloor)}
                    {highScore ? ` · أفضل رقم ${formatNumber(highScore)}` : ''}
                  </p>
                  <Button type="button" onClick={startRun}>
                    <RotateCcw />
                    تسلّق من جديد
                  </Button>
                </div>
              ) : current ? (
                <>
                  <p className={styles.category}>{current.category}</p>
                  <h2>{current.prompt}</h2>
                  <div className={styles.options}>
                    {current.options.map((option, index) => {
                      const isChosen = choice === index;
                      const isAnswer = index === current.answerIndex;
                      return (
                        <button
                          key={option}
                          type="button"
                          disabled={phase !== 'question'}
                          data-correct={phase === 'reveal' && isAnswer ? true : undefined}
                          data-wrong={phase === 'reveal' && isChosen && !isAnswer ? true : undefined}
                          onClick={() => resolveAnswer(index)}
                        >
                          <span>{optionLabels[index]}</span>
                          <strong>{option}</strong>
                        </button>
                      );
                    })}
                  </div>
                  {phase === 'reveal' ? (
                    <div className={styles.reveal}>
                      <p>
                        {choice === current.answerIndex ? (
                          <>
                            <ShieldCheck /> إجابة صائبة. {current.explanation}
                          </>
                        ) : (
                          <>إجابة غير صحيحة. {current.explanation}</>
                        )}
                      </p>
                      <Button type="button" onClick={continueAfterReveal}>
                        {floorIndex + 1 >= run.length || (choice !== current.answerIndex && lives <= 0)
                          ? 'عرض النتيجة'
                          : choice === current.answerIndex
                            ? 'الطابق التالي'
                            : 'واصل الصعود'}
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        )}
        </div>
      </section>
    </MotionScene>
  );
}
