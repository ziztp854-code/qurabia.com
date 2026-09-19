import { Skeleton } from '@/components/ui';

export default function QuizzesLoading() {
  return (
    <main className="section" aria-busy="true" aria-label="جارٍ تحميل المسابقات">
      <div className="container skeleton-stack">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <span className="sr-only">جارٍ تحميل المسابقات المنشورة…</span>
      </div>
    </main>
  );
}
