import styles from '@/components/admin/admin.module.css';
import {
  ADMIN_PERMISSIONS,
  APP_ROLES,
  hasPermission,
  PERMISSION_LABELS,
  ROLE_LABELS,
} from '@/lib/auth/authorization';
import { requireAdminConsole } from '@/lib/auth/session';

export default async function AdminPermissionsPage() {
  const user = await requireAdminConsole('/admin/permissions');

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>مصفوفة الصلاحيات</h2>
          <p>المنع هو الافتراضي، وهذه المصفوفة نفسها التي تستخدمها حراس الخادم.</p>
        </div>
      </div>
      <section className={styles.panel}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>القدرة</th>
              {APP_ROLES.map((role) => (
                <th key={role}>{ROLE_LABELS[role]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ADMIN_PERMISSIONS.map((permission) => (
              <tr key={permission}>
                <td data-label="القدرة">{PERMISSION_LABELS[permission]}</td>
                {APP_ROLES.map((role) => (
                  <td key={role} data-label={ROLE_LABELS[role]}>
                    {hasPermission(role, permission) ? (
                      <span aria-label="مسموح">✓</span>
                    ) : (
                      <span aria-label="ممنوع">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className={styles.notice}>
        دورك الحالي: {ROLE_LABELS[user.role]}. إخفاء الأزرار للوضوح فقط؛ القرار النهائي يُعاد التحقق
        منه على الخادم عند كل إجراء.
      </p>
    </div>
  );
}
