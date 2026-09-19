import { formatNumber } from '@/lib/utils';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Activity,
  BarChart3,
  BookOpen,
  Clock3,
  Crosshair,
  Crown,
  Eye,
  Plus,
  Radio,
  Trophy,
  Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout';
import { AdminVerifiedName, ButtonLink } from '@/components/ui';
import { ROLE_LABELS, canAccessAdmin, isAppRole } from '@/lib/auth/authorization';
import { planDefinition } from '@tahaddi/domain';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getDisplayPlanCode } from '@/lib/subscription/entitlements';
import { requireActiveUser } from '@/lib/auth/session';
import styles from './page.module.css';

const STATUS_LABELS = {
  ACTIVE: 'نشطة',
  ARCHIVED: 'مؤرشفة',
  DRAFT: 'مسودة',
} as const;

export default async function Page() {
  const user = await requireActiveUser('/dashboard');
  const prisma = getPrismaClient();
  const [
    profile,
    quizCount,
    activeQuizCount,
    activeSessionCount,
    questionCount,
    participantCount,
    answerCount,
    correctAnswerCount,
    quizStatuses,
    recentQuizzes,
    recentSessions,
    planCode,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { image: true, profile: { select: { avatarUrl: true, displayName: true } } },
    }),
    prisma.quiz.count({ where: { ownerId: user.id } }),
    prisma.quiz.count({ where: { ownerId: user.id, status: 'ACTIVE' } }),
    prisma.liveSession.count({ where: { hostId: user.id, status: { in: ['WAITING', 'ACTIVE'] } } }),
    prisma.question.count({ where: { ownerId: user.id } }),
    prisma.liveParticipant.count({ where: { session: { hostId: user.id } } }),
    prisma.liveAnswer.count({ where: { session: { hostId: user.id } } }),
    prisma.liveAnswer.count({ where: { session: { hostId: user.id }, isCorrect: true } }),
    prisma.quiz.groupBy({ by: ['status'], where: { ownerId: user.id }, _count: { _all: true } }),
    prisma.quiz.findMany({
      where: { ownerId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      select: {
        id: true,
        title: true,
        status: true,
        roomCode: true,
        updatedAt: true,
        _count: { select: { questions: true, liveSessions: true } },
      },
    }),
    prisma.liveSession.findMany({
      where: { hostId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        status: true,
        updatedAt: true,
        quiz: { select: { title: true } },
        _count: { select: { participants: true } },
      },
    }),
    getDisplayPlanCode(prisma, user.id, user.role),
  ]);

  const displayName = user.name?.trim() || profile?.profile?.displayName || 'مستخدم تحدّي';
  const avatarSrc = profile?.profile?.avatarUrl || profile?.image || user.image || null;
  const rankPlan = planDefinition(planCode);
  const isManager = user.role === 'OWNER' || user.role === 'ADMIN';
  const accuracy =
    answerCount > 0 ? `${Math.round((correctAnswerCount / answerCount) * 100)}%` : '—';
  const now = new Date();
  const statusCounts = Object.fromEntries(
    quizStatuses.map((item) => [item.status, item._count._all]),
  ) as Partial<Record<keyof typeof STATUS_LABELS, number>>;
  const activeAngle = quizCount > 0 ? ((statusCounts.ACTIVE || 0) / quizCount) * 360 : 0;
  const draftAngle =
    quizCount > 0 ? activeAngle + ((statusCounts.DRAFT || 0) / quizCount) * 360 : 0;
  const donutStyle = {
    '--active-angle': `${activeAngle}deg`,
    '--draft-angle': `${draftAngle}deg`,
  } as CSSProperties;
  const activitySessions = [...recentSessions].reverse();
  const activityMax = Math.max(
    1,
    ...activitySessions.map((session) => session._count.participants),
  );
  const activityPoints =
    activitySessions.length > 1
      ? activitySessions
          .map((session, index) => {
            const x = (index / (activitySessions.length - 1)) * 720;
            const y = 126 - (session._count.participants / activityMax) * 92;
            return `${x},${y}`;
          })
          .join(' ')
      : '0,118 720,118';
  const stats = [
    {
      label: 'نسبة الإجابات الصحيحة',
      value: accuracy,
      note: 'من الإجابات المسجلة',
      Icon: Crosshair,
      tone: 'rose',
    },
    {
      label: 'المسابقات النشطة',
      value: formatNumber(activeQuizCount),
      note: 'من مسابقاتك',
      Icon: Trophy,
      tone: 'gold',
    },
    {
      label: 'الغرف المباشرة',
      value: formatNumber(activeSessionCount),
      note: 'منتظرة أو نشطة',
      Icon: Radio,
      tone: 'blue',
    },
    {
      label: 'المشاركون',
      value: formatNumber(participantCount),
      note: 'في جلساتك',
      Icon: Users,
      tone: 'green',
    },
    {
      label: 'إجمالي الأسئلة',
      value: formatNumber(questionCount),
      note: 'في بنكك',
      Icon: BookOpen,
      tone: 'violet',
    },
  ] as const;

  const sidebarProfile = (
    <>
      <div className={styles.sidebarProfile}>
        <span className={styles.avatar}>
          {avatarSrc ? (
            <Image src={avatarSrc} alt="" fill sizes="4.25rem" unoptimized />
          ) : (
            displayName.slice(0, 1)
          )}
        </span>
        <span className={styles.sidebarIdentity}>
          <Link href="/profile" aria-label="فتح الملف الشخصي">
            <AdminVerifiedName isManager={isManager}>{displayName}</AdminVerifiedName>
            <small>{isAppRole(user.role) ? ROLE_LABELS[user.role] : 'مستخدم'}</small>
          </Link>
          <Link
            href="/orders"
            className={styles.rankChip}
            data-plan={planCode}
            aria-label={`رتبتك ${rankPlan.name} — فتح قاعة الأوسمة`}
          >
            <span aria-hidden="true">{rankPlan.emblem}</span>
            {rankPlan.name}
          </Link>
        </span>
      </div>
      <aside className={styles.sidebarCreate}>
        <Crown aria-hidden="true" />
        <strong>اصنع مسابقتك الآن</strong>
        <span>وانطلق بالتحدي مع الجميع</span>
        <ButtonLink href="/quizzes/new" variant="gold">
          <Plus aria-hidden="true" /> إنشاء مسابقة
        </ButtonLink>
      </aside>
    </>
  );

  return (
    <DashboardLayout
      className="command-dashboard-layout"
      sidebarProfile={sidebarProfile}
      actions={
        canAccessAdmin(user.role) ? (
          <ButtonLink href="/admin" variant="outline">
            إدارة المنصة
          </ButtonLink>
        ) : null
      }
    >
      <section className={styles.dashboard} aria-label="ملخص لوحة التحكم">
        <div className={styles.topline}>
          <div className={styles.dateCard}>
            <span className={styles.dateIcon}>
              <Clock3 aria-hidden="true" />
            </span>
            <span>
              {now.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              <small>
                {now.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
              </small>
            </span>
          </div>
        </div>

        <header className={styles.hero}>
          <Image
            className={styles.heroCrown}
            src="/home/tahaddi-crown-transparent-1024x683.webp"
            alt=""
            width={460}
            height={306}
            priority
          />
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>
              <Crown aria-hidden="true" /> مركز القيادة
            </span>
            <h2>
              مرحبًا بك مجددًا، {displayName} <span aria-hidden="true">👋</span>
            </h2>
            <p>جاهز لخوض تحديات جديدة اليوم؟</p>
            <ButtonLink href="/quizzes/new" variant="gold">
              <Plus aria-hidden="true" /> إنشاء مسابقة جديدة
            </ButtonLink>
          </div>
        </header>

        <section className={styles.stats} aria-label="إحصاءات حسابك">
          {stats.map(({ label, value, note, Icon, tone }) => (
            <article key={label} className={styles.stat} data-tone={tone}>
              <span className={styles.statIcon} aria-hidden="true">
                <Icon />
              </span>
              <span className={styles.statCopy}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </span>
            </article>
          ))}
        </section>

        <section className={styles.analyticsGrid} aria-label="تحليلات الحساب">
          <article className={`${styles.panel} ${styles.activityPanel}`}>
            <header>
              <h2>
                <Activity aria-hidden="true" /> النشاطات الأخيرة
              </h2>
            </header>
            {recentSessions.length > 0 ? (
              <ol className={styles.activityList}>
                {recentSessions.slice(0, 4).map((session) => (
                  <li key={session.id}>
                    <span className={styles.activityIcon}>
                      <Radio aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{session.quiz.title}</strong>
                      <small>
                        {session.status === 'ACTIVE'
                          ? 'جلسة جارية الآن'
                          : session.status === 'WAITING'
                            ? 'جلسة بانتظار اللاعبين'
                            : 'جلسة مكتملة'}
                      </small>
                    </span>
                    <time dateTime={session.updatedAt.toISOString()}>
                      {session.updatedAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>لا يوجد نشاط مسجل حتى الآن.</p>
            )}
            <Link className={styles.panelLink} href="/host">
              فتح لوحة المضيف ←
            </Link>
          </article>

          <article className={`${styles.panel} ${styles.distributionPanel}`}>
            <header>
              <h2>
                <BarChart3 aria-hidden="true" /> توزيع المسابقات حسب الحالة
              </h2>
            </header>
            <div className={styles.donutWrap}>
              <div
                className={styles.donut}
                style={donutStyle}
                role="img"
                aria-label={`إجمالي المسابقات ${formatNumber(quizCount)}`}
              >
                <span>
                  <strong>{formatNumber(quizCount)}</strong>
                  <small>مسابقة</small>
                </span>
              </div>
              <ul className={styles.legend}>
                <li data-tone="active">
                  <span /> نشطة <strong>{formatNumber(statusCounts.ACTIVE || 0)}</strong>
                </li>
                <li data-tone="draft">
                  <span /> مسودة <strong>{formatNumber(statusCounts.DRAFT || 0)}</strong>
                </li>
                <li data-tone="archived">
                  <span /> مؤرشفة <strong>{formatNumber(statusCounts.ARCHIVED || 0)}</strong>
                </li>
              </ul>
            </div>
          </article>

          <article className={`${styles.panel} ${styles.performancePanel}`}>
            <header>
              <h2>
                <Trophy aria-hidden="true" /> أداء آخر الجلسات
              </h2>
            </header>
            <div className={styles.chart}>
              <svg viewBox="0 0 720 145" role="img" aria-label="عدد المشاركين في آخر الجلسات">
                <defs>
                  <linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="#f0b93d" stopOpacity=".48" />
                    <stop offset="1" stopColor="#f0b93d" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={`M ${activityPoints.replaceAll(' ', ' L ')} L 720 140 L 0 140 Z`}
                  fill="url(#activity-fill)"
                />
                <polyline
                  points={activityPoints}
                  fill="none"
                  stroke="#f0b93d"
                  strokeWidth="4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className={styles.chartLabels}>
                {activitySessions.map((session) => (
                  <span key={session.id}>{formatNumber(session._count.participants)}</span>
                ))}
              </div>
            </div>
            <p className={styles.chartNote}>
              القيم تمثل المشاركين الفعليين في آخر {formatNumber(activitySessions.length)} جلسات.
            </p>
          </article>
        </section>

        <section className={styles.bottomGrid}>
          <article className={`${styles.panel} ${styles.competitionsPanel}`}>
            <header>
              <h2>جميع المسابقات</h2>
              <Link href="/quizzes">عرض الجميع</Link>
            </header>
            {recentQuizzes.length > 0 ? (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>المسابقة</th>
                      <th>الحالة</th>
                      <th>الأسئلة</th>
                      <th>الجلسات</th>
                      <th>آخر تحديث</th>
                      <th>
                        <span className="sr-only">الإجراء</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentQuizzes.map((quiz) => (
                      <tr key={quiz.id}>
                        <td>
                          <strong>{quiz.title}</strong>
                          <small dir="ltr">{quiz.roomCode}</small>
                        </td>
                        <td>
                          <span className={styles.status} data-status={quiz.status}>
                            {STATUS_LABELS[quiz.status]}
                          </span>
                        </td>
                        <td>{formatNumber(quiz._count.questions)}</td>
                        <td>{formatNumber(quiz._count.liveSessions)}</td>
                        <td>{quiz.updatedAt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}</td>
                        <td>
                          <Link
                            className={styles.iconLink}
                            href="/host"
                            aria-label={`فتح ${quiz.title}`}
                          >
                            <Eye aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>لم تُنشئ مسابقات بعد.</p>
            )}
          </article>

          <article className={`${styles.panel} ${styles.quickPanel}`}>
            <header>
              <h2>نظرة سريعة</h2>
            </header>
            <div className={styles.quickGrid}>
              <Link href="/quizzes">
                <Trophy aria-hidden="true" />
                <strong>{formatNumber(quizCount)}</strong>
                <span>مسابقة</span>
              </Link>
              <Link href="/questions">
                <BookOpen aria-hidden="true" />
                <strong>{formatNumber(questionCount)}</strong>
                <span>سؤال</span>
              </Link>
              <Link href="/host">
                <Radio aria-hidden="true" />
                <strong>{formatNumber(activeSessionCount)}</strong>
                <span>غرفة مباشرة</span>
              </Link>
              <Link href="/profile">
                <Users aria-hidden="true" />
                <strong>{formatNumber(participantCount)}</strong>
                <span>مشارك</span>
              </Link>
            </div>
          </article>
        </section>
      </section>
    </DashboardLayout>
  );
}
