import { Skeleton } from '@/components/ui';

export default function GamesLoading() {
  return (
    <main className="section" aria-busy="true" aria-label="جارٍ تحميل الألعاب">
      <div className="container skeleton-stack">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <span className="sr-only">جارٍ تحميل كتالوج الألعاب…</span>
      </div>
    </main>
  );
}
