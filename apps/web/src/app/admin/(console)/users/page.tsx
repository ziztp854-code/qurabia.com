import { formatNumber } from '@/lib/utils';
import { AdminVerifiedName, Button } from '@/components/ui';
import styles from '@/components/admin/admin.module.css';
import { MANAGED_APP_ROLES, ROLE_LABELS } from '@/lib/auth/authorization';
import { isPlanCode, planDefinition } from '@tahaddi/domain';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import { updateUserAccess, grantUserSubscription, cancelUserSubscriptionAction } from './actions';

const PAGE_SIZE = 20;
const GRANTABLE_PLANS = ['KNIGHT', 'PRINCE', 'SULTAN'] as const;
const GRANTABLE_DURATIONS = [7, 30, 90, 365] as const;
const resultMessages: Readonly<Record<string, string>> = {
  UPDATED: 'تم تحديث صلاحيات الحساب وإبطال جلساته القديمة.',
  SELF_MANAGEMENT_FORBIDDEN: 'لا يمكنك تغيير دورك أو حالة حسابك من هذه الشاشة.',
  PROTECTED_MANAGER: 'حساب المدير الأساسي محمي من التعديل.',
  MANAGER_ROLE_RESERVED: 'دور المدير محجوز للحساب الأساسي.',
  LAST_ACTIVE_ADMIN: 'لا يمكن تعطيل أو تخفيض آخر مدير نشط.',
  STALE_USER_VERSION: 'تغيّر الحساب منذ فتح الصفحة. حدّث الصفحة وحاول مجددًا.',
  NO_CHANGES: 'لم يتغير الدور أو الحالة.',
  REAUTHENTICATION_FAILED: 'تعذّرت إعادة المصادقة. استخدم كلمة مرور حسابك الإداري.',
  RATE_LIMITED: 'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
  INVALID_REQUEST: 'الطلب غير صالح.',
  REQUEST_FAILED: 'تعذّر تنفيذ الطلب بأمان.',
  SESSION_REVOKED: 'تغيّرت صلاحية جلستك. سجّل الدخول من جديد.',
  SUBSCRIPTION_GRANTED: 'تم منح الرتبة للمستخدم.',
  SUBSCRIPTION_CANCELLED: 'تم إلغاء الاشتراك الساري.',
  SUBSCRIPTION_DENIED: 'تعذّر تنفيذ طلب الرتبة (قد تكون رتبة المستخدم الحالية أعلى).',
};

function singleValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : '';
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('MANAGE_USERS', '/admin/users');
  const params = await searchParams;
  const query = singleValue(params.q).trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(singleValue(params.page), 10) || 1);
  const result = singleValue(params.result);
  const where = {
    status: { not: 'DELETED' as const },
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const prisma = getPrismaClient();
  const now = new Date();
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        tokenVersion: true,
        lastLoginAt: true,
        createdAt: true,
        subscriptions: {
          where: { status: 'ACTIVE', expiresAt: { gt: now } },
          orderBy: { expiresAt: 'desc' },
          select: { id: true, planCode: true, source: true, expiresAt: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>المستخدمون والصلاحيات</h2>
          <p>{formatNumber(total)} حسابًا قابلًا للإدارة.</p>
        </div>
        <form action="/admin/users" method="get">
          <label>
            <span className="sr-only">البحث في المستخدمين</span>
            <input name="q" type="search" defaultValue={query} placeholder="الاسم أو البريد" />
          </label>
        </form>
      </div>
      {result && resultMessages[result] && (
        <p className={styles.notice} role="status">
          {resultMessages[result]}
        </p>
      )}
      <p className={styles.notice}>
        تغيير الدور أو الحالة عملية حساسة: يلزم إدخال كلمة مرور حسابك الإداري، وتُسجل النتيجة في سجل
        النشاط. حسابات OAuth بلا كلمة مرور لا تستطيع تنفيذ هذا التغيير.
      </p>
      <section className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>الحساب</th>
              <th>الانضمام / آخر دخول</th>
              <th>الرتبة</th>
              <th>تغيير الوصول</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label="الحساب">
                  <span className={styles.identity}>
                    <AdminVerifiedName isManager={user.role === 'OWNER' || user.role === 'ADMIN'}>
                      <strong>{user.name || 'بلا اسم'}</strong>
                    </AdminVerifiedName>
                    <small>{user.email || 'بلا بريد'}</small>
                    <small>
                      {ROLE_LABELS[user.role]} ·{' '}
                      {user.status === 'ACTIVE'
                        ? 'نشط'
                        : user.status === 'SUSPENDED'
                          ? 'معلق'
                          : user.status}
                    </small>
                  </span>
                </td>
                <td data-label="الانضمام / آخر دخول">
                  <small>
                    انضم {user.createdAt.toLocaleDateString('ar-SA')}
                    <br />
                    آخر دخول {user.lastLoginAt?.toLocaleString('ar-SA-u-nu-latn') || '—'}
                  </small>
                </td>
                <td data-label="الرتبة">
                  {user.role === 'OWNER' ? (
                    <span className={styles.notice}>حساب محمي</span>
                  ) : (
                    <div className={styles.form}>
                      {user.subscriptions.map((subscription) => {
                        const plan = isPlanCode(subscription.planCode)
                          ? planDefinition(subscription.planCode)
                          : null;
                        return (
                          <form
                            key={subscription.id}
                            action={cancelUserSubscriptionAction}
                            className={styles.form}
                          >
                            <input type="hidden" name="userId" value={user.id} />
                            <input type="hidden" name="subscriptionId" value={subscription.id} />
                            <small>
                              {plan?.name ?? subscription.planCode} ·{' '}
                              {subscription.source === 'ADMIN'
                                ? 'منحة إدارة'
                                : subscription.source === 'ACHIEVEMENT'
                                  ? 'وفاء'
                                  : 'ختم'}{' '}
                              · حتى {subscription.expiresAt.toLocaleDateString('ar')}
                            </small>
                            <Button type="submit" variant="outline">
                              إلغاء
                            </Button>
                          </form>
                        );
                      })}
                      <form action={grantUserSubscription} className={styles.form}>
                        <input type="hidden" name="userId" value={user.id} />
                        <label>
                          الرتبة
                          <select name="planCode" defaultValue="KNIGHT">
                            {GRANTABLE_PLANS.map((plan) => (
                              <option key={plan} value={plan}>
                                {planDefinition(plan).name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          المدة
                          <select name="durationDays" defaultValue="30">
                            {GRANTABLE_DURATIONS.map((days) => (
                              <option key={days} value={days}>
                                {formatNumber(days)} يوم
                              </option>
                            ))}
                          </select>
                        </label>
                        <Button type="submit" variant="outline">
                          منح
                        </Button>
                      </form>
                    </div>
                  )}
                </td>
                <td data-label="تغيير الوصول">
                  {user.role === 'OWNER' ? (
                    <span className={styles.notice}>حساب المدير الأساسي محمي</span>
                  ) : (
                    <form action={updateUserAccess} className={styles.form}>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="expectedTokenVersion" value={user.tokenVersion} />
                      <label>
                        الدور
                        <select name="role" defaultValue={user.role}>
                          {MANAGED_APP_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        الحالة
                        <select name="status" defaultValue={user.status}>
                          <option value="ACTIVE">نشط</option>
                          <option value="SUSPENDED">معلق</option>
                        </select>
                      </label>
                      <label>
                        إعادة المصادقة
                        <input
                          name="currentPassword"
                          type="password"
                          autoComplete="current-password"
                          minLength={8}
                          required
                        />
                      </label>
                      <Button type="submit" variant="outline">
                        حفظ
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <nav className={styles.pagination} aria-label="صفحات المستخدمين">
        <a
          aria-disabled={page <= 1}
          href={`/admin/users?page=${Math.max(1, page - 1)}&q=${encodeURIComponent(query)}`}
        >
          السابق
        </a>
        <span>
          {formatNumber(page)} / {formatNumber(totalPages)}
        </span>
        <a
          aria-disabled={page >= totalPages}
          href={`/admin/users?page=${Math.min(totalPages, page + 1)}&q=${encodeURIComponent(query)}`}
        >
          التالي
        </a>
      </nav>
    </div>
  );
}
