import { Skeleton } from '@/components/ui';
import Link from 'next/link';
import { publicGames } from '@/data/games';

export default function GamesLoading() {
  return (
    <main className="section" aria-label="الألعاب">
      <div className="container skeleton-stack games-loading-skeleton" aria-busy="true">
        <Skeleton />
        <Skeleton />
        <Skeleton />
        <span className="sr-only">جارٍ تحميل كتالوج الألعاب…</span>
      </div>
      {/* Next's streaming boundary needs JS to reveal its completed subtree.
          Keep real destinations available while scripting is disabled. */}
      <noscript>
        <style>{'.games-loading-skeleton { display: none; }'}</style>
        <section className="container" aria-labelledby="native-games-title">
          <h1 id="native-games-title">ساحة الألعاب</h1>
          <p>
            اختر لعبتك المفضلة وابدأ جولة مباشرة مع أصدقائك، أو اختبر سرعتك وتركيزك في ألعاب فورية
            مصممة لتبقى المنافسة ممتعة.
          </p>
          <nav aria-label="الألعاب المتاحة">
            <ul>
              {publicGames
                .filter((game) => game.status !== 'soon')
                .map((game) => (
                  <li key={game.id}>
                    <Link href={game.href} prefetch={false}>
                      {game.name}
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
          <Link href="/" prefetch={false}>
            الرئيسية
          </Link>
        </section>
      </noscript>
    </main>
  );
}
