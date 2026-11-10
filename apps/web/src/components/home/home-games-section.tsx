import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { publicGames } from '@/data/games';
import styles from './prestige-home.module.css';

const featuredGameIds = ['chess', 'baloot', 'millionaire', 'letter-challenge'] as const;
const featuredGames = featuredGameIds.flatMap((id) => {
  const game = publicGames.find((item) => item.id === id);
  return game ? [game] : [];
});
const productionGames = publicGames.filter((game) => game.status !== 'soon');

export function HomeGamesSection() {
  return (
    <div className={styles.showcaseGrid} data-home-showcase>
      <section className={styles.gamesSection} aria-labelledby="featured-title">
        <div className={styles.sectionHead}>
          <span aria-hidden="true" />
          <h2 id="featured-title">اختَر تحدّيك القادم</h2>
          <span aria-hidden="true" />
        </div>
        <p className={styles.sectionIntro}>ذكاء، معرفة، أو منافسة على الطاولة. البداية على ذوقك.</p>
        <nav className={styles.games} aria-label="ألعاب بارزة">
          {featuredGames.map((game) => (
            <Link className={styles.game} href={game.href} key={game.href} data-scroll-reveal>
              <Image
                src={game.image}
                alt={game.imageAlt}
                width={320}
                height={230}
                sizes="(max-width: 767px) 44vw, (max-width: 1100px) 40vw, 20vw"
              />
              <strong>{game.name}</strong>
              <small>{game.category}</small>
              <span>العب الآن</span>
            </Link>
          ))}
        </nav>
        <Link href="/games" className={styles.catalogLink}>
          استكشف جميع الألعاب <ArrowLeft aria-hidden="true" />
        </Link>
        <details className={styles.moreGames}>
          <summary>المزيد من الألعاب</summary>
          <nav aria-label="روابط ألعاب الإنتاج">
            {productionGames.map((game) => (
              <Link href={game.href} key={game.id}>
                {game.name}
              </Link>
            ))}
          </nav>
        </details>
      </section>
    </div>
  );
}
