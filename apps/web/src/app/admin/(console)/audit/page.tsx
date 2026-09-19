import { formatNumber } from '@/lib/utils';
import styles from '@/components/admin/admin.module.css';
import { ROLE_LABELS } from '@/lib/auth/authorization';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';

const PAGE_SIZE = 30;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('VIEW_AUDIT', '/admin/audit');
  const rawPage = (await searchParams).page;
  const page = Math.max(1, Number.parseInt(typeof rawPage === 'string' ? rawPage : '', 10) || 1);
  const prisma = getPrismaClient();
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        result: true,
        reasonCode: true,
        actorRole: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
      },
    }),
    prisma.auditLog.count(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>سجل النشاط</h2>
          <p>سجل قراءة فقط للقرارات الإدارية الحساسة.</p>
        </div>
      </div>
      <section className={styles.panel}>
        {entries.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المنفذ</th>
                <th>الإجراء</th>
                <th>المورد</th>
                <th>النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="الوقت">{entry.createdAt.toLocaleString('ar-SA-u-nu-latn')}</td>
                  <td data-label="المنفذ">
                    <span className={styles.identity}>
                      <strong>{entry.actor?.name || entry.actor?.email || 'حساب محذوف'}</strong>
                      <small>{ROLE_LABELS[entry.actorRole]}</small>
                    </span>
                  </td>
                  <td data-label="الإجراء">
                    <span className={styles.identity}>
                      <strong>{entry.action}</strong>
                      {entry.targetUser && (
                        <small>{entry.targetUser.name || entry.targetUser.email || 'مستخدم'}</small>
                      )}
                    </span>
                  </td>
                  <td data-label="المورد">
                    {entry.resourceType}
                    {entry.resourceId ? ` · ${entry.resourceId.slice(0, 10)}` : ''}
                  </td>
                  <td data-label="النتيجة">
                    {entry.result === 'SUCCESS' ? 'تم' : 'مرفوض'}
                    {entry.reasonCode ? ` · ${entry.reasonCode}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>لا توجد سجلات بعد.</p>
        )}
      </section>
      <nav className={styles.pagination} aria-label="صفحات سجل النشاط">
        <a aria-disabled={page <= 1} href={`/admin/audit?page=${Math.max(1, page - 1)}`}>
          السابق
        </a>
        <span>
          {formatNumber(page)} / {formatNumber(totalPages)}
        </span>
        <a
          aria-disabled={page >= totalPages}
          href={`/admin/audit?page=${Math.min(totalPages, page + 1)}`}
        >
          التالي
        </a>
      </nav>
    </div>
  );
}
