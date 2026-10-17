'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Brain,
  ArrowLeft,
  Check,
  Printer,
  RotateCcw,
  Shapes,
  Lightbulb,
  ChartNoAxesColumnIncreasing,
  Award,
  Calculator,
  Network,
  Sprout,
  Mountain,
  CalendarDays,
  UserRound,
  Globe,
  FileText,
  Infinity as InfinityIcon,
} from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui';
import { BrandMark } from '@/components/brand';
import { ReportHeroArtwork, ReportMedal, ReportFooterArtwork } from './report-art';
import { calculateResult, DISCLAIMER, LEVELS, QUESTIONS } from './questions';
import styles from './intelligence-test.module.css';

type Completed = { answers: (number | null)[]; name: string; date: string };
const number = (value: number) => value.toLocaleString('ar-SA');
const REPORT_SITE_URL = 'https://qurabia.com';

function ThinkingMap() {
  return (
    <svg className={styles.thinkingMap} viewBox="0 0 400 180" fill="none" aria-hidden="true">
      <path
        className={styles.mapGrid}
        d="M0 45h400M0 90h400M0 135h400M50 0v180M100 0v180M150 0v180M200 0v180M250 0v180M300 0v180M350 0v180"
      />
      <path
        className={styles.mapLine}
        d="M62 132V90h65V48h73v42h72v42h66M127 132h73V48h72M62 90h65v42M200 90h72V48h66"
      />
      {[
        [62, 132],
        [127, 48],
        [200, 90],
        [272, 132],
        [338, 48],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle className={styles.mapHalo} cx={cx} cy={cy} r="15" />
          <circle className={styles.mapNode} cx={cx} cy={cy} r="5" />
        </g>
      ))}
      <path className={styles.mapSymbol} d="m193 35 7-12 7 12zm70 56h18v18h-18z" />
    </svg>
  );
}

function Report({ completed }: { completed: Completed }) {
  const result = calculateResult(completed.answers);
  return (
    <article className={styles.report}>
      <ReportHeroArtwork />
      <ReportFooterArtwork />
      <header className={styles.reportMasthead}>
        <a className={styles.reportBrand} href={REPORT_SITE_URL} aria-label="تحدّي — زيارة الموقع">
          <BrandMark title="شعار موقع تحدّي" />
          <span>
            <strong>تحدّي</strong>
            <small>تفاعل، تنافس، تميّز</small>
          </span>
        </a>
        <div className={styles.reportOrigin}>
          <span>تقرير الأداء الشخصي</span>
          <a href={REPORT_SITE_URL} dir="ltr">
            qurabia.com
          </a>
        </div>
      </header>
      <div className={styles.reportHeader}>
        <p className={styles.kicker}>رحلتك في التفكير</p>
        <h2>تقرير تحدي الذكاء</h2>
        <p className={styles.reportSubtitle}>ملخص أدائك في المنطق والأعداد والأنماط</p>
      </div>
      <div className={styles.reportIdentity}>
        <span>
          <UserRound size={22} aria-hidden="true" /> أُعدّ لـ{' '}
          <strong>{completed.name || 'لاعب تحدّي'}</strong>
        </span>
        <time>
          <CalendarDays size={22} aria-hidden="true" />
          {completed.date}
        </time>
      </div>
      <div className={styles.scorePanel}>
        <div className={styles.score}>
          <ReportMedal />
          <strong>{result.score}</strong>
          <span>من 100</span>
        </div>
        <div>
          <p className={styles.kicker}>مستواك في هذه المحاولة</p>
          <h3>{result.label}</h3>
          <p>{result.advice}</p>
          <span className={styles.correctCount}>
            <Check size={17} aria-hidden="true" /> {result.correct} إجابة صحيحة من{' '}
            {QUESTIONS.length}
          </span>
        </div>
      </div>
      <div className={styles.breakdown}>
        <section>
          <h3>
            <Brain size={24} aria-hidden="true" />
            حسب المهارة
          </h3>
          {result.skills.map((item, i) => {
            const Icon = [Calculator, Lightbulb, Network][i];
            return (
              <div
                className={styles.metricRow}
                data-tone={['red', 'orange', 'cyan'][i]}
                key={item.skill}
              >
                <Icon size={25} aria-hidden="true" />
                <span>{item.skill}</span>
                <progress
                  max={item.total}
                  value={item.correct}
                  aria-label={`نتيجة ${item.skill}`}
                />
                <b dir="ltr">
                  {item.correct} / {item.total}
                </b>
              </div>
            );
          })}
        </section>
        <section>
          <h3>
            <ChartNoAxesColumnIncreasing size={24} aria-hidden="true" />
            حسب الصعوبة
          </h3>
          {result.levels.map((item, i) => {
            const Icon = [Sprout, ChartNoAxesColumnIncreasing, Mountain][i];
            return (
              <div
                className={styles.metricRow}
                data-tone={['green', 'blue', 'purple'][i]}
                key={item.label}
              >
                <Icon size={25} aria-hidden="true" />
                <span>{item.label}</span>
                <progress
                  max={item.total}
                  value={item.correct}
                  aria-label={`نتيجة المستوى ${item.label}`}
                />
                <b dir="ltr">
                  {item.correct} / {item.total}
                </b>
              </div>
            );
          })}
        </section>
      </div>
      <p className={styles.method}>
        طريقة الحساب: نقطة للسؤال السهل، ونقطتان للمتوسط، وثلاث للمتقدم. حصلت على{' '}
        {number(result.points)} من {number(result.maximum)} نقطة، ثم حُوّلت إلى نسبة من ١٠٠ مع
        التقريب لأقرب عدد صحيح. المستويات: أقل من ٤٠ بداية للتدرّب، ٤٠–٥٩ واعد، ٦٠–٧٩ قوي، ٨٠–١٠٠
        متميز. هذه الحدود خاصة باللعبة وليست معايير علمية.
      </p>
      <p className={`${styles.note} ${styles.reportNote}`}>
        <FileText size={28} aria-hidden="true" />
        <span>{DISCLAIMER} إعادة الأسئلة نفسها قد تحسن النتيجة بسبب التذكر.</span>
      </p>
      <footer className={styles.reportFooter}>
        <span>
          <Award size={22} aria-hidden="true" /> تحدّي · كل سؤال فرصة للتفكير
        </span>
        <a href={REPORT_SITE_URL} dir="ltr">
          <Globe size={20} aria-hidden="true" />
          https://qurabia.com
        </a>
      </footer>
    </article>
  );
}

export function IntelligenceTest() {
  const [stage, setStage] = useState<'intro' | 'playing' | 'result'>('intro');
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState<(number | null)[]>(() => QUESTIONS.map(() => null));
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = QUESTIONS[index];

  useEffect(() => {
    if (stage !== 'intro') heading.current?.focus();
  }, [stage, index]);

  function next() {
    if (answers[index] === null) return;
    if (index < QUESTIONS.length - 1) {
      setIndex(index + 1);
      return;
    }
    if (answers.some((answer) => answer === null)) return;
    setCompleted({
      answers: [...answers],
      name: name.trim(),
      date: new Intl.DateTimeFormat('ar-SA', {
        dateStyle: 'long',
        timeZone: 'Asia/Riyadh',
        calendar: 'gregory',
      }).format(new Date()),
    });
    setStage('result');
  }

  function restart() {
    setAnswers(QUESTIONS.map(() => null));
    setIndex(0);
    setCompleted(null);
    setStage('playing');
  }

  return (
    <div className={styles.root} dir="rtl">
      <nav className={styles.back}>
        <ButtonLink href="/games" variant="ghost">
          العودة إلى الألعاب
        </ButtonLink>
      </nav>
      {stage === 'intro' && (
        <section className={styles.intro}>
          <div>
            <p className={styles.kicker}>
              <Brain size={20} aria-hidden="true" /> تحدي الذكاء{' '}
              <span className={styles.soloBadge}>تجربة فردية</span>
            </p>
            <h1>
              امنح عقلك
              <br />
              <em>تحدّيًا جديدًا.</em>
            </h1>
            <p className={styles.lead}>
              اكتشف طريقة تفكيرك عبر الأعداد والمنطق والأنماط. ابدأ بالسهل، واصعد إلى المتقدم، ثم
              احصل على تقرير أدائك.
            </p>
            <div className={styles.facts} aria-label="عن التحدي">
              <span>
                <b>١٨</b> سؤالًا متدرجًا
              </span>
              <span>
                <b>٣</b> مهارات للتفكير
              </span>
              <span>
                <InfinityIcon size={25} aria-hidden="true" />
                <b className={styles.factLabel}>خذ وقتك</b>
              </span>
            </div>
            <label className={styles.name}>
              <span className={styles.fieldLabel}>
                الاسم في التقرير <small>اختياري</small>
              </span>
              <input
                maxLength={60}
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="اكتب اسمك"
              />
            </label>
            <Button variant="gold" size="lg" onClick={() => setStage('playing')}>
              ابدأ تحدي الذكاء <ArrowLeft size={18} aria-hidden="true" />
            </Button>
            <p className={styles.privacy}>
              لا يُحفظ اسمك أو إجاباتك على الخادم. إغلاق الصفحة أو تحديثها يبدأ محاولة جديدة.
            </p>
          </div>
          <aside className={styles.path} aria-label="مراحل التحدي">
            <div className={styles.pathTitle}>
              <span>رحلة التفكير</span>
              <Shapes size={23} aria-hidden="true" />
            </div>
            <ThinkingMap />
            <h2 className={styles.pathHeading}>من الفكرة إلى الاستنتاج.</h2>
            <p className={styles.pathCaption}>ثلاث محطات، وكل خطوة تفتح تحدّيًا أعمق.</p>
            {LEVELS.map((level, i) => (
              <div className={styles.step} key={level}>
                <strong>{number(i + 1).padStart(2, '٠')}</strong>
                <div>
                  <h3>{level}</h3>
                  <p>٦ أسئلة · {['اكتشف القاعدة', 'اربط الأفكار', 'فكّر بعمق'][i]}</p>
                </div>
              </div>
            ))}
            <p>
              <Printer size={18} aria-hidden="true" /> تقرير نهائي قابل للطباعة والحفظ PDF
            </p>
          </aside>
          <p className={styles.note}>{DISCLAIMER}</p>
        </section>
      )}
      {stage === 'playing' && (
        <section className={styles.play}>
          <div className={styles.playTitle}>
            <span>
              <Brain size={21} aria-hidden="true" /> تحدي الذكاء
            </span>
            <span>خذ وقتك، فكّر بهدوء</span>
          </div>
          <ol className={styles.levelTrail} aria-label="مسار المستويات">
            {LEVELS.map((level, i) => (
              <li
                key={level}
                data-current={question.level === i + 1}
                data-complete={question.level > i + 1}
                aria-current={question.level === i + 1 ? 'step' : undefined}
              >
                <span>
                  {question.level > i + 1 ? <Check size={15} aria-hidden="true" /> : number(i + 1)}
                </span>
                {level}
              </li>
            ))}
          </ol>
          <p className={styles.kicker}>
            المستوى {number(question.level)} من ٣ · {LEVELS[question.level - 1]}
          </p>
          <div className={styles.progressLabel}>
            <span className={styles.skillBadge}>
              <Lightbulb size={15} aria-hidden="true" />
              {question.skill}
            </span>
            <span>
              السؤال {number(index + 1)} من {number(QUESTIONS.length)}
            </span>
          </div>
          <progress
            className={styles.progress}
            max={QUESTIONS.length}
            value={answers.filter((a) => a !== null).length}
            aria-label="الأسئلة المجابة"
          />
          <h1 ref={heading} tabIndex={-1} className={styles.question}>
            {question.prompt}
          </h1>
          {question.sequence && (
            <p
              className={styles.sequence}
              dir="ltr"
              aria-label={`النمط، يُقرأ من اليسار إلى اليمين: ${question.sequence}`}
            >
              {question.sequence}
            </p>
          )}
          {question.sequence && <p className={styles.hint}>اقرأ النمط من اليسار إلى اليمين.</p>}
          <div className={styles.options} role="group" aria-label="اختر إجابة">
            {question.options.map((option, optionIndex) => (
              <button
                key={`${index}-${optionIndex}`}
                type="button"
                aria-pressed={answers[index] === optionIndex}
                onClick={() =>
                  setAnswers((previous) =>
                    previous.map((answer, i) => (i === index ? optionIndex : answer)),
                  )
                }
              >
                <span className={styles.optionNumber}>{number(optionIndex + 1)}</span>
                <span>{option}</span>
                {answers[index] === optionIndex && <Check size={20} aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className={styles.actions}>
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              السابق
            </Button>
            <Button variant="gold" disabled={answers[index] === null} onClick={next}>
              {index === QUESTIONS.length - 1 ? 'عرض النتيجة والتقرير' : 'السؤال التالي'}
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
          </div>
          <p className={styles.playHint}>
            <Lightbulb size={18} aria-hidden="true" />
            <span>اختر إجابة للمتابعة. يمكنك العودة لتعديل إجاباتك قبل إظهار النتيجة.</span>
          </p>
        </section>
      )}
      {stage === 'result' && completed && (
        <section className={styles.results}>
          <h1 ref={heading} tabIndex={-1}>
            <ChartNoAxesColumnIncreasing size={25} aria-hidden="true" /> أكملت التحدي!
          </h1>
          <Report completed={completed} />
          <div className={styles.actions}>
            <Button variant="gold" onClick={() => window.print()}>
              <Printer size={18} aria-hidden="true" /> طباعة التقرير / حفظ PDF
            </Button>
            <Button variant="outline" onClick={restart}>
              <RotateCcw size={18} aria-hidden="true" /> أعد المحاولة
            </Button>
          </div>
          <p className={styles.hint}>
            من نافذة الطباعة اختر «حفظ بتنسيق PDF». اسمك ونتيجتك وتفصيل مهاراتك تظهر في التقرير.
          </p>
          <details className={styles.review}>
            <summary>راجع إجاباتك والتفسيرات</summary>
            {QUESTIONS.map((q, i) => (
              <section key={i}>
                <h3>
                  {number(i + 1)}. {q.prompt}
                </h3>
                {q.sequence && <pre dir="ltr">{q.sequence}</pre>}
                <p>
                  {completed.answers[i] === q.answer ? 'إجابة صحيحة' : 'إجابة غير صحيحة'} · إجابتك:{' '}
                  {q.options[completed.answers[i]!]}
                </p>
                <p>الإجابة الصحيحة: {q.options[q.answer]}</p>
                <p>{q.explanation}</p>
              </section>
            ))}
          </details>
          {createPortal(
            <div data-intelligence-print className={styles.printOnly} dir="rtl" lang="ar">
              <Report completed={completed} />
            </div>,
            document.body,
          )}
        </section>
      )}
    </div>
  );
}
