import { formatNumber } from '@/lib/utils';
import { ArrowLeft, CalendarDays, Plus, Radio, Trophy, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { PublicQuiz } from '@/app/quizzes/actions';
import { AdminVerifiedName, ButtonLink, EmptyState, buttonVariants } from '@/components/ui';
import styles from './quizzes-hub.module.css';

const TOURNAMENT_ARTWORKS = [
  { src: '/game-art/tournament-main.webp', alt: 'كأس ذهبي فوق منصة تتويج سوداء' },
  { src: '/game-art/chess-tournament.webp', alt: 'كأس ذهبي مع قطع شطرنج فاخرة' },
  { src: '/game-art/quizzes-cards.png', alt: 'طاولة مجلس ليلي مع دلة قهوة وأوراق لعب ذهبية' },
  { src: '/game-art/quiz-tournament.webp', alt: 'كأس ذهبي مع علامة استفهام ومنصة' },
] as const;

const PATHS = [
  {
    href: '/quizzes/new',
    title: 'أنشئ مسابقة',
    description: 'جهّز الأسئلة وشارك رمز الغرفة مع لاعبيك.',
    icon: Plus,
  },
  {
    href: '/join',
    title: 'انضم برمز',
    description: 'معك دعوة؟ أدخل الرمز واسمك للانضمام.',
    icon: Users,
  },
  {
    href: '/host',
    title: 'أدر البث',
    description: 'قدّم الأسئلة وتابع الإجابات والنتائج.',
    icon: Radio,
  },
] as const;

export function artworkForQuiz(quiz: PublicQuiz, index: number) {
  const title = quiz.title.toLocaleLowerCase('ar');
  if (title.includes('شطرنج')) return TOURNAMENT_ARTWORKS[1];
  if (title.includes('بلوت')) return TOURNAMENT_ARTWORKS[2];
  if (title.includes('سؤال') || title.includes('معلومات')) return TOURNAMENT_ARTWORKS[3];
  return TOURNAMENT_ARTWORKS[index % TOURNAMENT_ARTWORKS.length];
}

export function formatQuizDate(value: string) {
  return new Intl.DateTimeFormat('ar-SA', { day: 'numeric', month: 'short' }).format(
    new Date(value),
  );
}

function QuizOwnerIdentity({ quiz }: { quiz: PublicQuiz }) {
  if (!quiz.ownerName) return null;

  return (
    <span className={styles.owner}>
      <AdminVerifiedName isManager={quiz.ownerIsManager}>{quiz.ownerName}</AdminVerifiedName>
      {quiz.ownerIsManager && quiz.ownerRoleLabel ? (
        <span className={styles.ownerRole}>{quiz.ownerRoleLabel}</span>
      ) : null}
      {quiz.ownerIsManager ? <span className={styles.ownerVerified}>مدير موثّق</span> : null}
    </span>
  );
}

function QuizCard({ quiz, index }: { quiz: PublicQuiz; index: number }) {
  const art = artworkForQuiz(quiz, index);
  return (
    <Link href={`/join/${quiz.roomCode}`} className={styles.card}>
      <span className={styles.cardArt}>
        <Image src={art.src} alt={art.alt} fill sizes="(min-width: 900px) 30vw, 100vw" />
      </span>
      <span className={styles.cardBody}>
        <span className={styles.metaChip}>
          <span dir="ltr">{quiz.roomCode}</span>
        </span>
        <h3>{quiz.title}</h3>
        <p>{quiz.description || 'مسابقة عامة منشورة وجاهزة للانضمام.'}</p>
        <span className={styles.cardMeta}>
          <span>{formatNumber(quiz.questionCount)} سؤال</span>
          {quiz.ownerName ? (
            <>
              <span aria-hidden="true">·</span>
              <QuizOwnerIdentity quiz={quiz} />
            </>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

export function QuizzesHub({
  quizzes,
  loadError,
}: {
  quizzes: readonly PublicQuiz[];
  loadError?: string;
}) {
  const featuredQuiz = quizzes[0];
  const rest = quizzes.slice(1);
  const questionTotal = quizzes.reduce((sum, quiz) => sum + quiz.questionCount, 0);

  return (
    <section className={styles.hub} aria-labelledby="quizzes-heading">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>
            <Trophy aria-hidden="true" />
            مركز البطولات
          </span>
          <h1 id="quizzes-heading">المسابقات</h1>
          <p>اجمع أصحابك على سؤال. واترك الحسم للمعرفة.</p>
          <div className={styles.heroActions}>
            <ButtonLink href="/quizzes/new" variant="gold">
              أنشئ مسابقة
            </ButtonLink>
            <ButtonLink href="/join" variant="outline">
              انضم برمز
            </ButtonLink>
          </div>
          <p className={styles.guidance}>اختر مسابقة، أدخل اسمك، وانتظر بدء الجولة من المضيف.</p>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <Image
            src={TOURNAMENT_ARTWORKS[0].src}
            alt=""
            fill
            sizes="(min-width: 981px) 32vw, 100vw"
            priority
          />
        </div>
      </header>

      <div className={styles.stats} role="list">
        <article className={styles.stat} role="listitem">
          <span>مسابقات منشورة</span>
          <strong>{loadError ? '—' : formatNumber(quizzes.length)}</strong>
          <small>{loadError ? 'تعذّر جلب العدد' : 'في القائمة الحالية'}</small>
        </article>
        <article className={styles.stat} role="listitem">
          <span>أسئلة جاهزة</span>
          <strong>{loadError ? '—' : formatNumber(questionTotal)}</strong>
          <small>في الجولات الظاهرة</small>
        </article>
        <article className={styles.stat} role="listitem">
          <span>الدخول</span>
          <strong>برمز</strong>
          <small>من دعوة المضيف</small>
        </article>
      </div>

      <nav className={styles.paths} aria-label="مسارات المسابقة">
        {PATHS.map((path) => (
          <Link key={path.href} href={path.href} className={styles.path}>
            <path.icon aria-hidden="true" />
            <strong>{path.title}</strong>
            <span>{path.description}</span>
            <em>
              ابدأ
              <ArrowLeft aria-hidden="true" />
            </em>
          </Link>
        ))}
      </nav>

      <section className={styles.list} aria-labelledby="open-quizzes-title">
        <div className={styles.sectionHead}>
          <span className={styles.eyebrow}>اكتشف تحدّيك القادم</span>
          <h2 id="open-quizzes-title">البطولات المتاحة</h2>
          <p>تصفّح المسابقات المنشورة وافتح غرفة المسابقة التي تناسبك.</p>
        </div>

        {featuredQuiz ? (
          <>
            <article className={styles.featured}>
              <div className={styles.featuredArt}>
                <Image
                  src={artworkForQuiz(featuredQuiz, 0).src}
                  alt={artworkForQuiz(featuredQuiz, 0).alt}
                  fill
                  sizes="(min-width: 900px) 48vw, 100vw"
                />
              </div>
              <div className={styles.featuredCopy}>
                <span className={styles.latestChip}>الأحدث</span>
                <h3>{featuredQuiz.title}</h3>
                <p>{featuredQuiz.description || 'مسابقة عامة منشورة وجاهزة للانضمام.'}</p>
                {featuredQuiz.ownerName ? (
                  <div className={styles.featuredOwner} aria-label="منشئ المسابقة">
                    <QuizOwnerIdentity quiz={featuredQuiz} />
                  </div>
                ) : null}
                <div className={styles.facts}>
                  <span>
                    <Users aria-hidden="true" />
                    {formatNumber(featuredQuiz.questionCount)} سؤال
                  </span>
                  <span>
                    <CalendarDays aria-hidden="true" />
                    أُطلقت {formatQuizDate(featuredQuiz.createdAt)}
                  </span>
                  <span dir="ltr">{featuredQuiz.roomCode}</span>
                </div>
                <ButtonLink href={`/join/${featuredQuiz.roomCode}`} variant="gold">
                  شارك الآن
                </ButtonLink>
              </div>
            </article>
            {rest.length > 0 ? (
              <div className={styles.grid}>
                {rest.map((quiz, index) => (
                  <QuizCard key={quiz.id} quiz={quiz} index={index + 1} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.empty}>
            <EmptyState
              title={loadError ? 'تعذّر تحميل المسابقات العامة' : 'لا توجد مسابقات عامة منشورة بعد'}
              description={loadError || 'ابدأ بأسئلتك، أو انضم إلى غرفة خاصة باستخدام رمز الدعوة.'}
            />
            <div className={styles.emptyActions}>
              {loadError ? (
                <a href="/quizzes" className={buttonVariants({ variant: 'gold' })}>
                  أعد تحميل المسابقات
                </a>
              ) : (
                <ButtonLink href="/quizzes/new" variant="gold">
                  جهّز أول مسابقة
                </ButtonLink>
              )}
              <ButtonLink href="/join" variant="outline">
                لديّ رمز دعوة
              </ButtonLink>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
