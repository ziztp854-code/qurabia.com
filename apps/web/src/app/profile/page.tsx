import { formatNumber } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout';
import { CommandProfile, isCommandProfileRole } from '@/components/profile/command-profile';
import { isAppRole } from '@/lib/auth/authorization';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireActiveUser } from '@/lib/auth/session';
import { getDisplayPlanCode } from '@/lib/subscription/entitlements';
import {
  SPARK_SAMPLE_LIMIT,
  SPARK_WEEKS,
  bucketByWeek,
  emptySeries,
  sparkTrend,
  startOfWeekWindow,
} from '@/lib/profile/metrics';

function titleForRole(role: string): string {
  if (role === 'OWNER') return 'صاحب المنصة';
  if (role === 'ADMIN') return 'أدمن المنصة';
  return 'الملف الشخصي';
}

export default async function ProfilePage() {
  const user = await requireActiveUser('/profile');
  const prisma = getPrismaClient();
  const planCode = await getDisplayPlanCode(prisma, user.id, user.role);
  const elevated = isCommandProfileRole(user.role);
  const now = new Date();
  const windowStart = startOfWeekWindow(SPARK_WEEKS, now);
  const sparkWindow = {
    gte: windowStart,
  };

  const [
    profile,
    quizCount,
    questionCount,
    participantCount,
    platformUserCount,
    activeRoomCount,
    quizDates,
    questionDates,
    participantDates,
    userDates,
    roomDates,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        image: true,
        profile: { select: { avatarUrl: true, displayName: true } },
      },
    }),
    prisma.quiz.count({ where: { ownerId: user.id } }),
    prisma.question.count({ where: { ownerId: user.id } }),
    elevated
      ? prisma.liveParticipant.count()
      : prisma.liveParticipant.count({ where: { session: { hostId: user.id } } }),
    elevated ? prisma.user.count({ where: { status: { not: 'DELETED' } } }) : Promise.resolve(0),
    elevated
      ? prisma.liveSession.count({ where: { status: { in: ['WAITING', 'ACTIVE'] } } })
      : Promise.resolve(0),
    prisma.quiz.findMany({
      where: { ownerId: user.id, createdAt: sparkWindow },
      orderBy: { createdAt: 'desc' },
      take: SPARK_SAMPLE_LIMIT,
      select: { createdAt: true },
    }),
    prisma.question.findMany({
      where: { ownerId: user.id, createdAt: sparkWindow },
      orderBy: { createdAt: 'desc' },
      take: SPARK_SAMPLE_LIMIT,
      select: { createdAt: true },
    }),
    prisma.liveParticipant.findMany({
      where: {
        joinedAt: sparkWindow,
        ...(elevated ? {} : { session: { hostId: user.id } }),
      },
      orderBy: { joinedAt: 'desc' },
      take: SPARK_SAMPLE_LIMIT,
      select: { joinedAt: true },
    }),
    elevated
      ? prisma.user.findMany({
          where: { createdAt: sparkWindow, status: { not: 'DELETED' } },
          orderBy: { createdAt: 'desc' },
          take: SPARK_SAMPLE_LIMIT,
          select: { createdAt: true },
        })
      : Promise.resolve([]),
    elevated
      ? prisma.liveSession.findMany({
          where: { createdAt: sparkWindow },
          orderBy: { createdAt: 'desc' },
          take: SPARK_SAMPLE_LIMIT,
          select: { createdAt: true },
        })
      : Promise.resolve([]),
  ]);

  const quizSeries = bucketByWeek(
    quizDates.map((row) => row.createdAt),
    SPARK_WEEKS,
    now,
  );
  const questionSeries = bucketByWeek(
    questionDates.map((row) => row.createdAt),
    SPARK_WEEKS,
    now,
  );
  const followerSeries = bucketByWeek(
    participantDates.map((row) => row.joinedAt),
    SPARK_WEEKS,
    now,
  );
  const accountSeries = bucketByWeek(
    userDates.map((row) => row.createdAt),
    SPARK_WEEKS,
    now,
  );
  const roomSeries = bucketByWeek(
    roomDates.map((row) => row.createdAt),
    SPARK_WEEKS,
    now,
  );
  const adsSeries = emptySeries(SPARK_WEEKS);
  const displayName = user.name || profile?.profile?.displayName || 'مستخدم تحدّي';
  const avatarSrc = profile?.profile?.avatarUrl || profile?.image || user.image || null;

  return (
    <DashboardLayout
      title={titleForRole(isAppRole(user.role) ? user.role : 'USER')}
      breadcrumbLabel="الملف الشخصي"
      className="command-profile-layout"
    >
      <CommandProfile
        name={displayName}
        email={user.email || ''}
        role={user.role}
        status={user.status}
        image={avatarSrc}
        stats={[
          {
            label: 'المسابقات',
            value: formatNumber(quizCount),
            hint: 'في حسابك',
            series: quizSeries,
            tone: 'azure',
            trend: sparkTrend(quizSeries),
          },
          {
            label: 'الأسئلة',
            value: formatNumber(questionCount),
            hint: 'في بنكك',
            series: questionSeries,
            tone: 'gold',
            trend: sparkTrend(questionSeries),
          },
          {
            label: 'المتابعون',
            value: formatNumber(participantCount),
            hint: elevated ? 'إجمالي المنضمين عبر المنصة' : 'في جلساتك',
            series: followerSeries,
            tone: 'gold',
            trend: sparkTrend(followerSeries),
          },
        ]}
        platformStats={
          elevated
            ? [
                {
                  label: 'حالة الإعلانات',
                  value: '—',
                  hint: 'لا توجد حملات إعلانية في المنصة',
                  series: adsSeries,
                  tone: 'muted',
                  trend: 'flat',
                },
                {
                  label: 'حسابات المنصة',
                  value: formatNumber(platformUserCount),
                  hint: 'غير محذوفة',
                  series: accountSeries,
                  tone: 'azure',
                  trend: sparkTrend(accountSeries),
                },
                {
                  label: 'الغرف الحية',
                  value: formatNumber(activeRoomCount),
                  hint: 'منتظرة أو نشطة',
                  series: roomSeries,
                  tone: 'ivory',
                  trend: sparkTrend(roomSeries),
                },
              ]
            : []
        }
        planCode={planCode}
      />
    </DashboardLayout>
  );
}
