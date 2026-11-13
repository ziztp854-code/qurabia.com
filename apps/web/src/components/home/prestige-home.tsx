import { Crown } from 'lucide-react';
import Link from 'next/link';
import { SiteLayout, type HeaderUser } from '@/components/layout';
import { ButtonLink } from '@/components/ui';
import { publicNavigation } from '@/config/navigation';
import { HomeHero, type HomeRank } from './home-hero';
import { HomeGamesSection } from './home-games-section';
import { HomeWorldSection } from './home-world-section';
import styles from './prestige-home.module.css';

export type { HomeRank } from './home-hero';

const mobileNavigation = publicNavigation.filter((item) =>
  ['/', '/games', '/quizzes', '/leaderboard', '/profile'].includes(item.href),
);

export function PrestigeHome({
  user,
  rank = null,
}: {
  user: HeaderUser | null;
  rank?: HomeRank | null;
}) {
  return (
    <SiteLayout user={user} variant="home">
      <div className={`${styles.page} prestigeHome`}>
        <HomeHero rank={rank} />
        <HomeGamesSection />
        <HomeWorldSection />

        <section className={styles.closingCta} aria-label="استمر في التحدي" data-scroll-reveal>
          <Crown aria-hidden="true" />
          <p>
            <strong>استمر في التحدي</strong>
            <br />
            فالمجد ينتظر الأبطال!
          </p>
          <ButtonLink href="/games" variant="gold">
            اكتشف المزيد
          </ButtonLink>
        </section>

        <nav className={styles.mobileDock} aria-label="التنقل السفلي">
          {mobileNavigation.map((item) => (
            <Link
              href={item.href}
              aria-current={item.href === '/' ? 'page' : undefined}
              key={item.href}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </SiteLayout>
  );
}
