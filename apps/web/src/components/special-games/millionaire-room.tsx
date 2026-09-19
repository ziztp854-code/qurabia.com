'use client';

import {
  ArrowLeft,
  Check,
  CircleHelp,
  Crown,
  Gem,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Split,
  Trophy,
  UsersRound,
  X,
} from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Button, ButtonLink } from '@/components/ui';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { MotionScene } from '@/components/motion/motion-scene';
import { formatNumber } from '@/lib/utils';
import {
  buildMillionaireRun,
  MILLIONAIRE_LEVELS,
  MILLIONAIRE_QUESTION_BANK,
  MILLIONAIRE_SAFE_LEVELS,
  type MillionaireQuestion,
} from './millionaire-bank';
import styles from './millionaire-room.module.css';

type GamePhase = 'intro' | 'question' | 'reveal' | 'finished';
type HelperId = 'fifty' | 'audience' | 'switch';
type HelperUsage = Record<HelperId, boolean>;

const optionLabels = ['أ', 'ب', 'ج', 'د'] as const;
const defaultHelpers: HelperUsage = { fifty: false, audience: false, switch: false };

function getSafePrize(level: number) {
  if (level >= 15) return 1000000;
  if (level >= 10) return 32000;
  if (level >= 5) return 1000;
  return 0;
}

function getWrongOptions(question: MillionaireQuestion) {
  return question.options
    .map((_, index) => index)
    .filter((index) => index !== question.answerIndex) as Array<0 | 1 | 2 | 3>;
}

function getAudiencePulse(question: MillionaireQuestion) {
  const pulse = [12, 18, 21, 16];
  pulse[question.answerIndex] = 55;
  const remaining = 45;
  const wrongIndexes = getWrongOptions(question);
  wrongIndexes.forEach((index, order) => {
    pulse[index] = order === 0 ? 18 : order === 1 ? 15 : remaining - 33;
  });
  return pulse;
}

function Ladder({ currentLevel }: { currentLevel: number }) {
  return (
    <ol className={styles.ladder} aria-label="سلم المليون">
      {MILLIONAIRE_LEVELS.map((value, index) => {
        const level = index + 1;
        return (
          <li
            key={value}
            data-current={level === currentLevel || undefined}
            data-safe={MILLIONAIRE_SAFE_LEVELS.includes(level as 5 | 10 | 15) || undefined}
          >
            <span>{formatNumber(level)}</span>
            <strong>{formatNumber(value)}</strong>
          </li>
        );
      }).reverse()}
    </ol>
  );
}

function HelperButton({
  helper,
  used,
  disabled,
  onClick,
}: {
  helper: HelperId;
  used: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const meta = {
    fifty: { title: 'حذف إجابتين', description: 'يبقي احتمالين فقط', icon: Split },
    audience: { title: 'نبض الجمهور', description: 'تصويت تقديري سريع', icon: UsersRound },
    switch: { title: 'بوابة التبديل', description: 'استبدل سؤال المستوى', icon: Sparkles },
  }[helper];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      className={styles.helperButton}
      disabled={used || disabled}
      onClick={onClick}
      aria-label={used ? `${meta.title} — استُخدمت` : meta.title}
    >
      <Icon aria-hidden="true" />
      <span>
        <strong>{meta.title}</strong>
        <small>{used ? 'استُخدمت' : meta.description}</small>
      </span>
    </button>
  );
}

export function MillionaireRoom({
  preferredQuestions,
}: {
  preferredQuestions?: readonly MillionaireQuestion[] | null;
}) {
  const [seed, setSeed] = useState(0);
  const questions = useMemo(
    () => buildMillionaireRun(seed, preferredQuestions ?? []),
    [preferredQuestions, seed],
  );
  const [phase, setPhase] = useState<GamePhase>('intro');
  const [levelIndex, setLevelIndex] = useState(0);
  const [helpers, setHelpers] = useState<HelperUsage>(defaultHelpers);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [audiencePulse, setAudiencePulse] = useState<number[] | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [finalPrize, setFinalPrize] = useState(0);
  const [finishTitle, setFinishTitle] = useState('');

  const question = questions[levelIndex] ?? questions[0];
  const currentLevel = levelIndex + 1;
  const currentPrize = question.value;
  const levelProgress = `${Math.round((currentLevel / MILLIONAIRE_LEVELS.length) * 100)}%`;
  const bankLevels = new Set(MILLIONAIRE_QUESTION_BANK.map((item) => item.level)).size;
  const canContinue =
    phase === 'reveal' && selectedOption === question.answerIndex && currentLevel < 15;

  const startGame = () => {
    setPhase('question');
    setLevelIndex(0);
    setHelpers(defaultHelpers);
    setHiddenOptions([]);
    setAudiencePulse(null);
    setSelectedOption(null);
    setFinalPrize(0);
    setFinishTitle('');
  };

  const resetGame = () => {
    setSeed((value) => value + 1);
    setPhase('intro');
    setLevelIndex(0);
    setHelpers(defaultHelpers);
    setHiddenOptions([]);
    setAudiencePulse(null);
    setSelectedOption(null);
    setFinalPrize(0);
    setFinishTitle('');
  };

  const useFifty = () => {
    const wrong = getWrongOptions(question);
    setHiddenOptions(wrong.slice(0, 2));
    setHelpers((current) => ({ ...current, fifty: true }));
  };

  const useAudience = () => {
    setAudiencePulse(getAudiencePulse(question));
    setHelpers((current) => ({ ...current, audience: true }));
  };

  const useSwitch = () => {
    setSeed((value) => value + 1);
    setHiddenOptions([]);
    setAudiencePulse(null);
    setSelectedOption(null);
    setHelpers((current) => ({ ...current, switch: true }));
  };

  const chooseOption = (index: number) => {
    if (phase !== 'question') return;
    setSelectedOption(index);
    setPhase('reveal');
    if (index !== question.answerIndex) {
      setFinalPrize(getSafePrize(currentLevel - 1));
      setFinishTitle('انتهت الرحلة عند سؤال صعب');
    } else if (currentLevel === 15) {
      setFinalPrize(1000000);
      setFinishTitle('مليون تحدّي');
    }
  };

  const nextQuestion = () => {
    if (!canContinue) return;
    setLevelIndex((value) => value + 1);
    setHiddenOptions([]);
    setAudiencePulse(null);
    setSelectedOption(null);
    setPhase('question');
  };

  const walkAway = () => {
    const prize = levelIndex === 0 ? 0 : (questions[levelIndex - 1]?.value ?? 0);
    setFinalPrize(prize);
    setFinishTitle('انسحاب ذكي');
    setPhase('finished');
  };

  const finishAfterReveal = () => {
    setPhase('finished');
  };

  if (phase === 'intro') {
    return (
      <MotionScene scene={phase}>
        <main className={styles.shell}>
          <section className={styles.hero}>
            <div className={styles.heroSpotlight} aria-hidden="true" />
            <ButtonLink href="/games" variant="ghost">
              <ArrowLeft aria-hidden="true" />
              كل الألعاب
            </ButtonLink>
            <div className={styles.heroMark} aria-hidden="true">
              <Crown />
            </div>
            <span className={styles.eyebrow}>
              <Gem aria-hidden="true" />
              بنك أسئلة متدرّج
            </span>
            <h1>من سيربح المليون؟</h1>
            <p>نسخة تحدّي: 15 مستوى، محطات أمان، ووسائل مساعدة تشعل القرار قبل الإجابة.</p>
            <div className={styles.heroStats} aria-label="ملخص اللعبة">
              <span>{formatNumber(MILLIONAIRE_QUESTION_BANK.length)} سؤالًا</span>
              <span>{formatNumber(bankLevels)} مستوى</span>
              <span>3 وسائل مساعدة</span>
            </div>
            <Button variant="gold" size="lg" onClick={startGame}>
              <Trophy aria-hidden="true" />
              ابدأ رحلة المليون
            </Button>
          </section>
        </main>
      </MotionScene>
    );
  }

  if (phase === 'finished') {
    return (
      <MotionScene scene={phase}>
        <main className={styles.shell}>
          <section className={styles.finishPanel}>
            <Trophy aria-hidden="true" />
            <span>{finishTitle}</span>
            <h1><AnimatedNumber value={finalPrize} /> نقطة</h1>
            <p>
              {finalPrize === 1000000
                ? 'وصلت إلى قمة السلم. هذه لحظة تستحق إعادة اللقطة.'
                : 'يمكنك إعادة الرحلة ببنك سؤال مختلف للمستويات نفسها.'}
            </p>
            <Button variant="gold" size="lg" onClick={resetGame}>
              <RotateCcw aria-hidden="true" />
              رحلة جديدة
            </Button>
          </section>
        </main>
      </MotionScene>
    );
  }

  const isCorrect = selectedOption === question.answerIndex;

  return (
    <MotionScene scene={phase} sceneKey={`${phase}-${levelIndex}`}>
      <main className={styles.playShell}>
      <section className={styles.stage} aria-label="منطقة السؤال">
        <header className={styles.topBar}>
          <ButtonLink href="/games" variant="ghost">
            <ArrowLeft aria-hidden="true" />
            الألعاب
          </ButtonLink>
          <div>
            <span>السؤال {formatNumber(currentLevel)} من 15</span>
            <strong><AnimatedNumber value={currentPrize} /></strong>
          </div>
          <Button variant="outline" onClick={walkAway} disabled={phase === 'reveal'}>
            انسحاب
          </Button>
        </header>

        <div
          className={styles.questionPanel}
          data-result={phase === 'reveal' ? (isCorrect ? 'correct' : 'wrong') : undefined}
        >
          <div className={styles.prizeMarquee} aria-hidden="true">
            <span>الجائزة الحالية</span>
            <strong><AnimatedNumber value={currentPrize} /></strong>
          </div>
          <div
            className={styles.levelTrack}
            style={{ '--level-progress': levelProgress } as CSSProperties}
            aria-label={`تقدمت إلى ${formatNumber(currentLevel)} من 15`}
            role="meter"
            aria-valuemin={1}
            aria-valuemax={15}
            aria-valuenow={currentLevel}
          >
            <span>البداية</span>
            <i aria-hidden="true" />
            <span>المليون</span>
          </div>
          <div className={styles.questionMeta}>
            <span>{question.category}</span>
            {MILLIONAIRE_SAFE_LEVELS.includes(currentLevel as 5 | 10 | 15) && (
              <span>
                <ShieldCheck aria-hidden="true" />
                محطة أمان
              </span>
            )}
          </div>
          <h1>{question.prompt}</h1>

          <div className={styles.options} role="list" aria-label="خيارات الإجابة">
            {question.options.map((option, index) => {
              const hidden = hiddenOptions.includes(index);
              const selected = selectedOption === index;
              const correct = phase === 'reveal' && question.answerIndex === index;
              const wrong = phase === 'reveal' && selected && !correct;
              return (
                <div key={option} role="listitem">
                  <button
                    type="button"
                    disabled={hidden || phase === 'reveal'}
                    data-hidden={hidden || undefined}
                    data-correct={correct || undefined}
                    data-wrong={wrong || undefined}
                    aria-label={`${optionLabels[index]} ${hidden ? 'محذوف' : option}`}
                    onClick={() => chooseOption(index)}
                  >
                    <span>{optionLabels[index]}</span>
                    <strong>{hidden ? 'محذوف' : option}</strong>
                    {correct && <Check aria-hidden="true" />}
                    {wrong && <X aria-hidden="true" />}
                  </button>
                </div>
              );
            })}
          </div>

          {audiencePulse && (
            <section className={styles.audiencePanel} aria-label="نبض الجمهور">
              {audiencePulse.map((value, index) => (
                <div key={optionLabels[index]}>
                  <span>{optionLabels[index]}</span>
                  <meter
                    min={0}
                    max={100}
                    value={value}
                    aria-label={`تصويت ${optionLabels[index]}`}
                  />
                  <strong>{formatNumber(value)}٪</strong>
                </div>
              ))}
            </section>
          )}

          {phase === 'reveal' && (
            <section className={styles.revealPanel} role="status">
              <span>{isCorrect ? 'إجابة صحيحة' : 'إجابة خاطئة'}</span>
              <p>{question.explanation}</p>
              {isCorrect && currentLevel < 15 ? (
                <Button variant="gold" size="lg" onClick={nextQuestion}>
                  السؤال التالي
                </Button>
              ) : (
                <Button
                  variant={isCorrect ? 'gold' : 'outline'}
                  size="lg"
                  onClick={finishAfterReveal}
                >
                  عرض النتيجة
                </Button>
              )}
            </section>
          )}
        </div>

        <section className={styles.helpers} aria-label="وسائل المساعدة">
          <HelperButton
            helper="fifty"
            used={helpers.fifty}
            disabled={phase === 'reveal'}
            onClick={useFifty}
          />
          <HelperButton
            helper="audience"
            used={helpers.audience}
            disabled={phase === 'reveal'}
            onClick={useAudience}
          />
          <HelperButton
            helper="switch"
            used={helpers.switch}
            disabled={phase === 'reveal'}
            onClick={useSwitch}
          />
        </section>
      </section>

      <aside className={styles.sidePanel}>
        <div className={styles.safeBox}>
          <CircleHelp aria-hidden="true" />
          <span>الضمان الحالي</span>
          <strong>{formatNumber(getSafePrize(currentLevel - 1))}</strong>
        </div>
        <Ladder currentLevel={currentLevel} />
      </aside>
      </main>
    </MotionScene>
  );
}
