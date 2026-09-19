import { formatNumber } from '@/lib/utils';
import { BadgeCheck, Ban, Stamp as StampIcon } from 'lucide-react';
import { Button } from '@/components/ui';
import { DashboardLayout } from '@/components/layout';
import { planDefinition, isPlanCode } from '@tahaddi/domain';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import { revokeStampAction } from './actions';
import { IssueStampsForm } from './issue-stamps-form';
import styles from './stamps.module.css';

const STATUS_LABELS = {
  UNUSED: 'ساري',
  REDEEMED: 'مُستخدم',
  REVOKED: 'ملغى',
} as const;

const SOURCE_LABELS = {
  STAMP: 'ختم',
  ACHIEVEMENT: 'وفاء',
  ADMIN: 'إدارة',
} as const;

export default async function StampsPage() {
  await requirePermission('MANAGE_USERS', '/admin/stamps');
  const prisma = hasDatabaseUrl() ? getPrismaClient() : null;
  const stamps = prisma
    ? await prisma.subscriptionStamp.findMany({
        orderBy: { issuedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          code: true,
          planCode: true,
          durationDays: true,
          status: true,
          note: true,
          issuedAt: true,
          redeemedAt: true,
          redeemedBy: true,
        },
      })
    : [];

  const unusedCount = stamps.filter((stamp) => stamp.status === 'UNUSED').length;
  const redeemedCount = stamps.filter((stamp) => stamp.status === 'REDEEMED').length;

  return (
    <DashboardLayout title="أختام الأوسمة">
      <section className={styles.console} aria-label="إدارة أختام الأوسمة">
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>
              <StampIcon aria-hidden="true" />
              خزنة الأوسمة
            </span>
            <h2>أختام الدخول الملكية</h2>
            <p>
              كل ختم يفعّل رتبة لحاملها. أصدر الأختام، وزّعها على مستخدميك، وتتبّع استعمالها هنا.
            </p>
          </div>
          <dl className={styles.stats}>
            <div>
              <dt>سارية</dt>
              <dd>{formatNumber(unusedCount)}</dd>
            </div>
            <div>
              <dt>مفعّلة</dt>
              <dd>{formatNumber(redeemedCount)}</dd>
            </div>
          </dl>
        </header>

        <IssueStampsForm />

        <div className={styles.tableWrap}>
          <table>
            <caption className="sr-only">قائمة الأختام الصادرة</caption>
            <thead>
              <tr>
                <th scope="col">الرمز</th>
                <th scope="col">الرتبة</th>
                <th scope="col">المدة</th>
                <th scope="col">الحالة</th>
                <th scope="col">ملاحظة</th>
                <th scope="col">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {stamps.length === 0 ? (
                <tr>
                  <td colSpan={6}>لم يُصدر أي ختم بعد.</td>
                </tr>
              ) : (
                stamps.map((stamp) => {
                  const plan = isPlanCode(stamp.planCode)
                    ? planDefinition(stamp.planCode).name
                    : stamp.planCode;
                  return (
                    <tr key={stamp.id} data-status={stamp.status}>
                      <td dir="ltr">{stamp.code}</td>
                      <td>{plan}</td>
                      <td>{formatNumber(stamp.durationDays)} يوم</td>
                      <td>
                        {stamp.status === 'REDEEMED' ? (
                          <BadgeCheck aria-hidden="true" />
                        ) : stamp.status === 'REVOKED' ? (
                          <Ban aria-hidden="true" />
                        ) : null}
                        {STATUS_LABELS[stamp.status]}
                      </td>
                      <td>{stamp.note ?? '—'}</td>
                      <td>
                        {stamp.status === 'UNUSED' ? (
                          <form action={revokeStampAction}>
                            <input type="hidden" name="stampId" value={stamp.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              إلغاء
                            </Button>
                          </form>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className={styles.hint}>
          المصادر: {SOURCE_LABELS.STAMP} · {SOURCE_LABELS.ACHIEVEMENT} (مكافأة الوفاء الآلية) ·{' '}
          {SOURCE_LABELS.ADMIN}. تُسجّل كل عمليات الإصدار والإلغاء في سجل النشاط.
        </p>
      </section>
    </DashboardLayout>
  );
}
