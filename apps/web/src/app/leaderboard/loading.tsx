import { Skeleton } from '@/components/ui';

export default function LeaderboardLoading() {
  return (
    <main className="section" aria-busy="true" aria-label="جارٍ تحميل لوحة الشرف">
      <div className="container skeleton-stack">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <span className="sr-only">جارٍ تحميل النتائج المنشورة…</span>
      </div>
    </main>
  );
}
