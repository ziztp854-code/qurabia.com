import { formatNumber } from '@/lib/utils';
import styles from '@/components/admin/admin.module.css';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';

export default async function AdminReportsPage() {
  await requirePermission('VIEW_REPORTS', '/admin/reports');
  const prisma = getPrismaClient();
  const [
    sessionCount,
    participantCount,
    answerCount,
    correctAnswerCount,
    publishedQuizCount,
    suspendedUserCount,
    topSessions,
  ] = await Promise.all([
    prisma.liveSession.count(),
    prisma.liveParticipant.count(),
    prisma.liveAnswer.count(),
    prisma.liveAnswer.count({ where: { isCorrect: true } }),
    prisma.quiz.count({ where: { status: 'ACTIVE', isPublic: true } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.liveSession.findMany({
      orderBy: { participants: { _count: 'desc' } },
      take: 10,
      select: {
        id: true,
        status: true,
        createdAt: true,
        quiz: { select: { title: true } },
        _count: { select: { participants: true, answers: true } },
      },
    }),
  ]);
  const accuracy =
    answerCount > 0
      ? `${formatNumber(Math.round((correctAnswerCount / answerCount) * 100))}٪`
      : '—';

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>تقارير المنصة</h2>
          <p>مؤشرات مجمعة لا تكشف إجابات اللاعبين الفردية.</p>
        </div>
      </div>
      <div className={styles.stats}>
        <article className={styles.stat}>
          <strong>{formatNumber(sessionCount)}</strong>
          <span>إجمالي الجلسات</span>
        </article>
        <article className={styles.stat}>
          <strong>{formatNumber(participantCount)}</strong>
          <span>مشاركة مسجلة</span>
        </article>
        <article className={styles.stat}>
          <strong>{accuracy}</strong>
          <span>دقة الإجابات</span>
        </article>
        <article className={styles.stat}>
          <strong>{formatNumber(publishedQuizCount)}</strong>
          <span>مسابقة عامة نشطة</span>
        </article>
      </div>
      {suspendedUserCount > 0 && (
        <p className={styles.notice}>
          يوجد {formatNumber(suspendedUserCount)} حسابًا معلقًا حاليًا.
        </p>
      )}
      <section className={styles.panel}>
        <h3>الجلسات الأعلى مشاركة</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>المسابقة</th>
              <th>المشاركون</th>
              <th>الإجابات</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {topSessions.map((session) => (
              <tr key={session.id}>
                <td data-label="المسابقة">{session.quiz.title}</td>
                <td data-label="المشاركون">
                  {formatNumber(session._count.participants)}
                </td>
                <td data-label="الإجابات">{formatNumber(session._count.answers)}</td>
                <td data-label="التاريخ">{session.createdAt.toLocaleDateString('ar-SA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
