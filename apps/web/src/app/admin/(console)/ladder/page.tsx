import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { LadderRoom, LadderRoomSnapshot, LadderRoundResult } from '@tahaddi/domain';
import { Button } from '@/components/ui';
import { LadderReportList } from './report-list';
import styles from '@/components/admin/admin.module.css';
import { getPrismaClient } from '@/lib/auth/prisma';
import { getSharedRedis } from '@/lib/auth/rate-limit';
import { requireActiveUser } from '@/lib/auth/session';
import { formatNumber } from '@/lib/utils';

type FinishedRoom = LadderRoom & { roundHistory?: LadderRoundResult[] };

async function recentReports(): Promise<FinishedRoom[] | null> {
  const redis = getSharedRedis();
  if (!redis) return null;
  try {
    const codes = await redis.smembers<string[]>('ladder:roomCodes:active');
    const rooms = await Promise.all(
      codes.slice(0, 100).map((code) => redis.get<FinishedRoom>(`ladder:room:${code}`)),
    );
    return rooms
      .filter((room): room is FinishedRoom =>
        Boolean(room && room.status === 'finished' && room.roundHistory?.length),
      )
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  } catch {
    return null;
  }
}

function reportSnapshot(room: FinishedRoom): LadderRoomSnapshot {
  return {
    roomCode: room.roomCode,
    phase: room.status,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    rightScore: room.rightScore,
    leftScore: room.leftScore,
    rightPosition: room.rightPosition,
    leftPosition: room.leftPosition,
    winningPosition: room.winningPosition,
    questionTimeLimit: room.questionTimeLimit ?? 30,
    currentQuestion: null,
    rightTeam: room.teams.filter((team) => team.team === 'right'),
    leftTeam: room.teams.filter((team) => team.team === 'left'),
    isHost: true,
    endedAt: room.endedAt,
    roundHistory: room.roundHistory,
  };
}

export default async function LadderAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireActiveUser('/admin/ladder', '/admin/login');
  if (user.role !== 'OWNER') redirect('/forbidden');
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 200) : '';
  const requestedPage = Number(params.page);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10000) : 1;
  const prisma = getPrismaClient();
  const base = { gameTypes: { has: 'LADDER' as const } };
  const where = {
    ...base,
    ...(q ? { prompt: { contains: q, mode: 'insensitive' as const } } : {}),
  };
  const [total, published, filtered, questions, reports] = await Promise.all([
    prisma.question.count({ where: base }),
    prisma.question.count({ where: { ...base, status: 'PUBLISHED' } }),
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [{ lastEditedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 20,
      select: {
        id: true,
        prompt: true,
        status: true,
        difficulty: true,
        category: { select: { name: true } },
      },
    }),
    recentReports(),
  ]);
  const href = (next: number) =>
    `/admin/ladder?${new URLSearchParams({ ...(q ? { q } : {}), page: String(next) })}`;
  const labels = {
    DRAFT: 'مسودة',
    PUBLISHED: 'منشور',
    ARCHIVED: 'مؤرشف',
    EASY: 'سهل',
    MEDIUM: 'متوسط',
    HARD: 'صعب',
  };
  return (
    <div className={styles.section} dir="rtl">
      <header className={styles.sectionHeader}>
        <div>
          <span className={styles.eyebrow}>خاص بالأونر</span>
          <h2>لوحة لعبة السلم</h2>
          <p>أسئلة السلم وتقارير اللقاءات المتاحة في مكان واحد.</p>
        </div>
      </header>
      <div className={styles.stats}>
        <article className={styles.stat}>
          <strong>{formatNumber(total)}</strong>
          <span>أسئلة السلم</span>
        </article>
        <article className={styles.stat}>
          <strong>{formatNumber(published)}</strong>
          <span>سؤال منشور</span>
        </article>
        <article className={styles.stat}>
          <strong>{reports === null ? '—' : formatNumber(reports.length)}</strong>
          <span>تقارير متاحة مؤقتًا</span>
        </article>
      </div>
      <section className={styles.panel} aria-labelledby="ladder-bank">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="ladder-bank">بنك أسئلة السلم</h3>
            <p>أسئلة البنك المركزي المرتبطة بالسلم · {formatNumber(filtered)} نتيجة</p>
          </div>
          <Link href="/admin/content?game=LADDER">إدارة البنك والفلاتر</Link>
        </div>
        <form method="get">
          <label htmlFor="ladder-search">بحث في الأسئلة</label>{' '}
          <input id="ladder-search" name="q" defaultValue={q} />{' '}
          <Button type="submit" size="sm">
            بحث
          </Button>
        </form>
        {questions.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>السؤال</th>
                <th>التصنيف</th>
                <th>الصعوبة</th>
                <th>الحالة</th>
                <th>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((question) => (
                <tr key={question.id}>
                  <td data-label="السؤال">{question.prompt}</td>
                  <td data-label="التصنيف">{question.category?.name ?? 'بدون تصنيف'}</td>
                  <td data-label="الصعوبة">{labels[question.difficulty]}</td>
                  <td data-label="الحالة">{labels[question.status]}</td>
                  <td data-label="الإجراء">
                    <Link href={`/questions/${question.id}?admin=1`}>تعديل</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.notice}>لا توجد أسئلة مطابقة.</p>
        )}
        <nav className={styles.pagination} aria-label="صفحات أسئلة السلم">
          {page > 1 && <Link href={href(page - 1)}>الصفحة السابقة</Link>}
          {page * 20 < filtered && <Link href={href(page + 1)}>الصفحة التالية</Link>}
        </nav>
      </section>
      <section className={styles.panel} aria-labelledby="ladder-reports">
        <h3 id="ladder-reports">تقارير اللقاءات</h3>
        <p>
          تظهر تقارير الغرف المنتهية المتاحة مؤقتًا فقط، حتى انتهاء صلاحية الغرفة أو حذفها. لا يوجد
          أرشيف دائم حاليًا. تُفحص أول ١٠٠ غرفة متاحة.
        </p>
        {reports === null ? (
          <p className={styles.notice}>تعذّر الاتصال بمصدر تقارير السلم الآن.</p>
        ) : reports.length === 0 ? (
          <p className={styles.notice}>لا توجد تقارير متاحة حاليًا.</p>
        ) : (
          <LadderReportList rooms={reports.map(reportSnapshot)} />
        )}
      </section>
    </div>
  );
}
