import { formatNumber } from '@/lib/utils';
import { AdminVerifiedName, Button } from '@/components/ui';
import styles from '@/components/admin/admin.module.css';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';
import { finishManagedRoom } from './actions';

const messages: Readonly<Record<string, string>> = {
  FINISHED: 'تم إنهاء الغرفة وتسجيل التدخل الإداري.',
  INVALID_REQUEST: 'الغرفة غير موجودة أو منتهية بالفعل.',
  STALE_ROOM: 'تغيّرت حالة الغرفة. حدّث الصفحة.',
  REQUEST_FAILED: 'تعذّر إنهاء الغرفة الآن.',
  SESSION_REVOKED: 'تغيّرت صلاحية جلستك. سجّل الدخول من جديد.',
};

export default async function AdminRoomsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission('MANAGE_ROOMS', '/admin/rooms');
  const rawResult = (await searchParams).result;
  const result = typeof rawResult === 'string' ? rawResult : '';
  const rooms = await getPrismaClient().liveSession.findMany({
    where: { status: { in: ['WAITING', 'ACTIVE'] } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      roomCode: true,
      status: true,
      startedAt: true,
      createdAt: true,
      quiz: { select: { title: true } },
      host: { select: { name: true, email: true, role: true } },
      _count: { select: { participants: true, answers: true } },
    },
  });

  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2>الغرف المباشرة</h2>
          <p>مراقبة الغرف النشطة والتدخل الموثق عند الحاجة.</p>
        </div>
      </div>
      {result && messages[result] && (
        <p className={styles.notice} role="status">
          {messages[result]}
        </p>
      )}
      <section className={styles.panel}>
        {rooms.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>الغرفة</th>
                <th>المضيف</th>
                <th>المشاركون</th>
                <th>الحالة</th>
                <th>التدخل</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td data-label="الغرفة">
                    <span className={styles.identity}>
                      <strong>{room.quiz.title}</strong>
                      <small dir="ltr">{room.roomCode}</small>
                    </span>
                  </td>
                  <td data-label="المضيف">
                    <AdminVerifiedName
                      isManager={room.host.role === 'OWNER' || room.host.role === 'ADMIN'}
                    >
                      {room.host.name || room.host.email || '—'}
                    </AdminVerifiedName>
                  </td>
                  <td data-label="المشاركون">{formatNumber(room._count.participants)}</td>
                  <td data-label="الحالة">{room.status === 'ACTIVE' ? 'نشطة' : 'انتظار'}</td>
                  <td data-label="التدخل">
                    <form action={finishManagedRoom}>
                      <input type="hidden" name="sessionId" value={room.id} />
                      <Button type="submit" variant="destructive" size="sm">
                        إنهاء الغرفة
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.muted}>لا توجد غرف نشطة الآن.</p>
        )}
      </section>
    </div>
  );
}
