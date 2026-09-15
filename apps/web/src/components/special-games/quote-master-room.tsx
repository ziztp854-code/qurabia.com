'use client';

import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  Clipboard,
  Feather,
  Flame,
  Heart,
  Play,
  RotateCcw,
  Trophy,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'react-qr-code';
import { Button, ButtonLink } from '@/components/ui';
import { formatNumber } from '@/lib/utils';
import {
  buildQuoteMasterRun,
  comboMultiplier,
  QUOTE_MASTER_BASE_POINTS,
  QUOTE_MASTER_LIVES,
  QUOTE_MASTER_SECONDS,
  QUOTE_MASTER_SPEED_BONUS,
  QUOTE_MASTER_SPEED_THRESHOLD,
  type QuoteQuestion,
} from './quote-master-bank';
import styles from './quote-master-room.module.css';

type Phase = 'lobby' | 'question' | 'reveal' | 'finished';
const optionLabels = ['A', 'B', 'C', 'D'] as const;

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRoomCode(): string {
  let code = '';
  const buffer = new Uint32Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buffer);
  }
  for (let i = 0; i < 6; i += 1) {
    const value = buffer[i] || Math.floor(Math.random() * ROOM_ALPHABET.length);
    code += ROOM_ALPHABET[value % ROOM_ALPHABET.length];
  }
  return code;
}

/** بطاقات شخصيات الغلاف — تظهر في ردهة المضيف قبل البدء. */
const COVER_ROLES = [
  { label: 'شاعر', icon: Feather },
  { label: 'عالِم', icon: BookOpenText },
  { label: 'حاكم', icon: Trophy },
  { label: 'مفكّر', icon: Flame },
] as const;

export function QuoteMasterRoom() {
  const [run, setRun] = useState<QuoteQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [lives, setLives] = useState(QUOTE_MASTER_LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [seconds, setSeconds] = useState(QUOTE_MASTER_SECONDS);
  const [copied, setCopied] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  // يُولّد رمز الغرفة على العميل فقط (تعيين الحالة أثناء التصيير لا داخل effect
  // حتى لا يحدث اختلاف ترطيب مع الخادم ولا يُخالف قاعدة set-state-in-effect).
  if (roomCode === '' && typeof window !== 'undefined') {
    setRoomCode(makeRoomCode());
  }

  const shareUrl = useMemo(() => {
    if (!roomCode || typeof window === 'undefined') return '';
    return `${window.location.origin}/games/quote-master/join/${roomCode}`;
  }, [roomCode]);

  const current = run[index];
  const total = run.length || 12;
  const multiplier = comboMultiplier(streak);

  // نفاد الوقت يكشف الإجابة تلقائيًا (نمط تحديد الحالة أثناء التصيير في React 19).
  const [prevKey, setPrevKey] = useState<string | null>(null);
  const autoKey = current ? `${current.id}:${phase}:${seconds}:${choice}` : null;
  if (
    autoKey !== null &&
    autoKey !== prevKey &&
    phase === 'question' &&
    seconds === 0 &&
    choice === null
  ) {
    setPrevKey(autoKey);
    reveal(-1);
  }

  useEffect(() => {
    if (phase !== 'question') return;
    const timer = window.setInterval(() => {
      setSeconds((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, index]);

  function reveal(selected: number) {
    if (!current || phase !== 'question') return;
    setChoice(selected);
    setPhase('reveal');
    if (selected === current.answerIndex) {
      const fast = seconds >= QUOTE_MASTER_SPEED_THRESHOLD;
      const gain = QUOTE_MASTER_BASE_POINTS * multiplier + (fast ? QUOTE_MASTER_SPEED_BONUS : 0);
      setScore((value) => value + gain);
      setStreak((value) => {
        const next = value + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    } else {
      setLives((value) => Math.max(0, value - 1));
      setStreak(0);
    }
  }

  function startGame() {
    setRun(buildQuoteMasterRun());
    setIndex(0);
    setLives(QUOTE_MASTER_LIVES);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setChoice(null);
    setPhase('question');
    setSeconds(QUOTE_MASTER_SECONDS);
  }

  function hostReveal() {
    if (!current || phase !== 'question') return;
    setPhase('reveal');
  }

  function goNext() {
    if (!current) return;
    if (index + 1 >= run.length) {
      setPhase('finished');
      return;
    }
    setIndex((value) => value + 1);
    setChoice(null);
    setPhase('question');
    setSeconds(QUOTE_MASTER_SECONDS);
  }

  function advance() {
    if (phase === 'question') {
      hostReveal();
      return;
    }
    goNext();
  }

  function goPrev() {
    if (index === 0) return;
    setIndex((value) => value - 1);
    setChoice(null);
    setPhase('question');
    setSeconds(QUOTE_MASTER_SECONDS);
  }

  async function copyInvite() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      /* المتصفح رفض النسخ */
    }
  }

  const timerRatio = phase === 'question' ? seconds / QUOTE_MASTER_SECONDS : phase === 'reveal' ? 0 : 1;
  const ringLength = 2 * Math.PI * 52;

  return (
    <section className={styles.room} dir="rtl" data-phase={phase}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.shell}>
        <ButtonLink href="/games" variant="ghost" className={styles.back}>
          كل الألعاب
        </ButtonLink>

        {/* ═════ الغلاف / ردهة المضيف ═════ */}
        {phase === 'lobby' ? (
          <div className={styles.cover}>
            <div className={styles.coverHead}>
              <span className={styles.emblem}>
                <span className={styles.emblemIcon} aria-hidden="true">
                  <Feather size={22} strokeWidth={2.2} />
                </span>
                <h1>مَنِ القائل؟</h1>
                <p>اختبر معرفتك بأشهر الأقوال</p>
              </span>
            </div>

            <div className={styles.coverGrid}>
              <div className={styles.rolesCard}>
                <div className={styles.roleCards}>
                  {COVER_ROLES.map(({ label, icon: Icon }) => (
                    <span key={label} className={styles.roleCard}>
                      <Icon size={26} aria-hidden="true" />
                      <strong>{label}</strong>
                    </span>
                  ))}
                </div>
                <ul className={styles.rules}>
                  <li>يعرض المضيف القول على الشاشة الكبيرة، والمتسابقون يجيبون من هواتفهم.</li>
                  <li>إجابات صحيحة متتالية ترفع مضاعف النقاط حتى ×5، والسرعة تمنح مكافأة.</li>
                  <li>اثنا عشر قولاً من عمالقة الأدب العربي، وأعلى نقاط يتصدّر.</li>
                </ul>
                <Button variant="gold" size="lg" onClick={startGame} disabled={!roomCode} fullWidth>
                  <Play aria-hidden="true" />
                  ابدأ اللعبة
                </Button>
              </div>

              <div className={styles.invitePanel}>
                <span className={styles.inviteEyebrow}>
                  <Users size={15} aria-hidden="true" /> دعوة المتسابقين
                </span>
                <div className={styles.qrFrame}>
                  {shareUrl ? (
                    <QRCode
                      value={shareUrl}
                      size={168}
                      bgColor="var(--qr-paper)"
                      fgColor="var(--qr-ink)"
                      aria-label={`رمز باركود للانضمام إلى الغرفة ${roomCode}`}
                    />
                  ) : (
                    <div className={styles.qrLoading} aria-hidden="true" />
                  )}
                </div>
                <p className={styles.inviteHint}>امسح الباركود بكاميرا الهاتف للانضمام</p>
                <div className={styles.roomCodeBox}>
                  <span>رمز الغرفة</span>
                  <strong dir="ltr">{roomCode || '••••••'}</strong>
                </div>
                <Button variant="outline" size="sm" onClick={copyInvite} disabled={!shareUrl} fullWidth>
                  {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                  {copied ? 'نُسخ رابط الدعوة' : 'انسخ رابط الدعوة'}
                </Button>
              </div>
            </div>
          </div>
        ) : phase === 'finished' ? (
          /* ═════ الختام ═════ */
          <div className={styles.finale}>
            <span className={styles.emblemIcon} aria-hidden="true">
              <Trophy size={30} strokeWidth={2} />
            </span>
            <h2>انتهت الجولة</h2>
            <p>
              الرصيد النهائي {formatNumber(score)} · أطول سلسلة {formatNumber(bestStreak)}
            </p>
            <div className={styles.finaleActions}>
              <Button variant="gold" size="lg" onClick={startGame}>
                <RotateCcw aria-hidden="true" />
                جولة جديدة
              </Button>
              <ButtonLink href="/games" variant="outline" size="lg">
                العودة إلى الألعاب
              </ButtonLink>
            </div>
          </div>
        ) : (
          /* ═════ عرض السؤال ═════ */
          <div className={styles.stage}>
            {/* بطاقة المؤقّت — يمين */}
            <aside className={`${styles.sideCard} ${styles.timerCard}`}>
              <span className={styles.sideLabel}>السؤال</span>
              <strong className={styles.sideCount} dir="ltr">
                {formatNumber(index + 1)} / {formatNumber(total)}
              </strong>
              <div className={styles.timerRing}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle className={styles.ringTrack} cx="60" cy="60" r="52" />
                  <circle
                    className={styles.ringFill}
                    cx="60"
                    cy="60"
                    r="52"
                    strokeDasharray={ringLength}
                    strokeDashoffset={ringLength * (1 - timerRatio)}
                    data-ending={phase === 'question' && seconds <= 6 ? true : undefined}
                  />
                </svg>
                <span className={styles.timerValue}>
                  <strong>{formatNumber(phase === 'question' ? seconds : 0)}</strong>
                  <small>ثانية</small>
                </span>
              </div>
            </aside>

            {/* اللوحة المركزية */}
            <div className={styles.centerColumn}>
              <div className={styles.emblemBar}>
                <span className={styles.emblemSmall}>
                  <Feather size={16} aria-hidden="true" /> مَنِ القائل؟
                </span>
              </div>

              {current ? (
                <>
                  <blockquote className={styles.quotePlaque}>
                    <span className={styles.quoteMark} aria-hidden="true">
                      ”
                    </span>
                    <div className={styles.quoteLines}>
                      {current.quote.split('\n').map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                    <span className={styles.quoteCategory}>{current.category}</span>
                  </blockquote>

                  <div className={styles.options}>
                    {current.options.map((option, i) => {
                      const isChosen = choice === i;
                      const isAnswer = i === current.answerIndex;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={styles.option}
                          disabled={phase !== 'question'}
                          data-correct={phase === 'reveal' && isAnswer ? true : undefined}
                          data-wrong={phase === 'reveal' && isChosen && !isAnswer ? true : undefined}
                          onClick={() => reveal(i)}
                        >
                          <span className={styles.optionKey}>{optionLabels[i]}</span>
                          <strong>{option}</strong>
                        </button>
                      );
                    })}
                  </div>

                  {phase === 'reveal' ? (
                    <p className={styles.revealNote}>
                      {choice === current.answerIndex ? '✔ ' : `الإجابة: ${current.options[current.answerIndex]} — `}
                      {current.explanation}
                    </p>
                  ) : null}

                  <div className={styles.dots} aria-hidden="true">
                    {run.map((q, i) => (
                      <span key={q.id} className={styles.dot} data-active={i === index || undefined} data-done={i < index || undefined} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>

            {/* بطاقة النقاط — يسار */}
            <aside className={`${styles.sideCard} ${styles.scoreCard}`}>
              <div className={styles.hearts}>
                {Array.from({ length: QUOTE_MASTER_LIVES }).map((_, i) => (
                  <Heart key={i} size={22} fill={i < lives ? 'currentColor' : 'none'} opacity={i < lives ? 1 : 0.3} aria-hidden="true" />
                ))}
              </div>
              <dl className={styles.scoreStats}>
                <div data-combo={streak > 0 || undefined}>
                  <dt>
                    <Flame size={16} aria-hidden="true" />
                  </dt>
                  <dd>
                    <strong dir="ltr">×{formatNumber(multiplier)}</strong>
                    <span>مضاعف النقاط</span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Trophy size={16} aria-hidden="true" />
                  </dt>
                  <dd>
                    <strong>{formatNumber(score)}</strong>
                    <span>النقاط</span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <BookOpenText size={16} aria-hidden="true" />
                  </dt>
                  <dd>
                    <strong dir="ltr">{formatNumber(index + 1)} / {formatNumber(total)}</strong>
                    <span>السؤال الحالي</span>
                  </dd>
                </div>
              </dl>
            </aside>

            {/* شريط التحكم */}
            <div className={styles.controls}>
              <Button variant="outline" size="sm" onClick={goPrev} disabled={index === 0}>
                <ArrowRight aria-hidden="true" />
                السؤال السابق
              </Button>
              <Button variant="gold" size="sm" onClick={advance}>
                {phase === 'question' ? 'كشف الإجابة' : index + 1 >= run.length ? 'النتيجة' : 'السؤال التالي'}
                <ArrowLeft aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
