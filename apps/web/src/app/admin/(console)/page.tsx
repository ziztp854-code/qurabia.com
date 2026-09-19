import { formatNumber } from '@/lib/utils';
import { Activity, FileQuestion, Radio, Users } from 'lucide-react';
import Link from 'next/link';
import { AudienceRadar } from '@/components/admin/audience-radar';
import { Badge } from '@/components/ui';
import styles from '@/components/admin/admin.module.css';
import { canManageQuestions, hasPermission, ROLE_LABELS } from '@/lib/auth/authorization';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requireAdminConsole } from '@/lib/auth/session';
import { getAudienceSnapshot } from '@/lib/presence/audience';

export default async function AdminOverviewPage() {
  const user = await requireAdminConsole('/admin');
  const prisma = getPrismaClient();
  const audience = canManageQuestions(user.role)
    ? await getAudienceSnapshot().catch(() => null)
    : null;
  const [userCount, activeRoomCount, questionCount, quizCount, recentActivity] = await Promise.all([
    prisma.user.count({ where: { status: { not: 'DELETED' } } }),
    prisma.liveSession.count({ where: { status: { in: ['WAITING', 'ACTIVE'] } } }),
    prisma.question.count({ where: { status: { not: 'ARCHIVED' } } }),
    prisma.quiz.count({ where: { status: { not: 'ARCHIVED' } } }),
    hasPermission(user.role, 'VIEW_AUDIT')
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            action: true,
            result: true,
            actorRole: true,
            createdAt: true,
            actor: { select: { name: true, email: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className={styles.section}>
      {canManageQuestions(user.role) ? <AudienceRadar initial={audience} /> : null}
      <div className={styles.sectionHeader}>
        <div>
          <h2>حالة المنصة الآن</h2>
          <p>مؤشرات حقيقية من قاعدة البيانات، وليست أرقامًا تجريبية.</p>
        </div>
      </div>
      <div className={styles.stats}>
        <article className={styles.stat}>
          <Users aria-hidden="true" />
          <strong>{formatNumber(userCount)}</strong>
          <span>حسابًا مسجلًا</span>
        </article>
        <article className={styles.stat}>
          <Radio aria-hidden="true" />
          <strong>{formatNumber(activeRoomCount)}</strong>
          <span>غرفة نشطة أو منتظرة</span>
        </article>
        <article className={styles.stat}>
          <FileQuestion aria-hidden="true" />
          <strong>{formatNumber(questionCount)}</strong>
          <span>سؤالًا غير مؤرشف</span>
        </article>
        <article className={styles.stat}>
          <strong>{formatNumber(quizCount)}</strong>
          <span>مسابقة غير مؤرشفة</span>
        </article>
      </div>
      {hasPermission(user.role, 'VIEW_AUDIT') && (
        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>
                <Activity aria-hidden="true" /> آخر القرارات
              </h3>
              <p>آخر الإجراءات الإدارية المسجلة.</p>
            </div>
            <Link href="/admin/audit">فتح السجل الكامل</Link>
          </div>
          {recentActivity.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>الإجراء</th>
                  <th>المنفذ</th>
                  <th>الدور</th>
                  <th>النتيجة</th>
                  <th>الوقت</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((item) => (
                  <tr key={item.id}>
                    <td data-label="الإجراء">{item.action}</td>
                    <td data-label="المنفذ">
                      {item.actor?.name || item.actor?.email || 'حساب محذوف'}
                    </td>
                    <td data-label="الدور">{ROLE_LABELS[item.actorRole]}</td>
                    <td data-label="النتيجة">
                      <Badge>{item.result === 'SUCCESS' ? 'تم' : 'مرفوض'}</Badge>
                    </td>
                    <td data-label="الوقت">{item.createdAt.toLocaleString('ar-SA-u-nu-latn')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>لا توجد إجراءات إدارية مسجلة بعد.</p>
          )}
        </section>
      )}
    </div>
  );
}
