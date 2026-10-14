import { ArrowLeft, Castle, Crown, Gamepad2, Globe2, QrCode, Trophy, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { PrestigeStage } from '@/components/home/prestige-stage';
import { RoomCodeShortcut } from '@/components/home/room-code-shortcut';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { SiteLayout, type HeaderUser } from '@/components/layout';
import { ButtonLink } from '@/components/ui';
import { publicNavigation } from '@/config/navigation';
import { publicGames } from '@/data/games';
import type { PlanCode } from '@tahaddi/domain';
import styles from './prestige-home.module.css';
import worldStyles from './mamluk-home.module.css';
import { GradientText } from '@/components/react-bits/gradient-text';
import { Magnet } from '@/components/react-bits/magnet';

const RANK_EMBLEM: Record<PlanCode, string> = {
  SPECTATOR: '/ranks/emblem-spectator.png',
  KNIGHT: '/ranks/emblem-knight.png',
  PRINCE: '/ranks/emblem-prince.png',
  SULTAN: '/ranks/emblem-sultan.png',
};

const featuredGameIds = ['chess', 'baloot', 'millionaire', 'letter-challenge'] as const;
const featuredGames = featuredGameIds.flatMap((id) => {
  const game = publicGames.find((item) => item.id === id);
  return game ? [game] : [];
});
const productionGames = publicGames.filter((game) => game.status !== 'soon');
const mobileNavigation = publicNavigation.filter((item) =>
  ['/', '/games', '/quizzes', '/leaderboard', '/profile'].includes(item.href),
);
export type HomeRank = {
  code: string;
  name: string;
  emblem: string;
};

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
        <section className={styles.hero} id="top" aria-labelledby="landing-title">
          <PrestigeStage>
            <div className={styles.copy}>
              <h1 id="landing-title">
                <GradientText>تحدي</GradientText>
                <span className={styles.heroPromise}>جمعتكم تبدأ بلعبة.</span>
              </h1>
              <p className={styles.tagline}>
                اختر تحدّيك، اجمع أصدقاءك، وشاركهم جولة تستحق المنافسة.
              </p>
              {rank ? (
                <Link
                  href="/orders"
                  className={styles.rankBadge}
                  data-plan={rank.code}
                  aria-label={`رتبتك ${rank.name} — فتح قاعة الأوسمة`}
                >
                  <Image
                    className={styles.rankBadgeEmblem}
                    src={RANK_EMBLEM[rank.code as PlanCode]}
                    alt={`شارة رتبة ${rank.name}`}
                    width={256}
                    height={256}
                  />
                  <b>{rank.name}</b>
                </Link>
              ) : null}
              <div className={styles.actions}>
                <ButtonLink href="/games" variant="gold">
                  <Magnet>
                    ابدأ اللعب الآن
                    <ArrowLeft aria-hidden="true" />
                  </Magnet>
                </ButtonLink>
                <ButtonLink href="/join" variant="outline">
                  انضم برمز
                  <QrCode aria-hidden="true" />
                </ButtonLink>
              </div>
              <InstallAppButton />
              <RoomCodeShortcut />
            </div>

            <div className={styles.values} role="list" aria-label="مزايا المنصة">
              <span role="listitem">
                <Zap aria-hidden="true" />
                <b>تحديات مباشرة</b>
                <small>العب مع أصدقائك</small>
              </span>
              <span role="listitem">
                <Trophy aria-hidden="true" />
                <b>منافسة حقيقية</b>
                <small>اختبر مهاراتك</small>
              </span>
              <span role="listitem">
                <Gamepad2 aria-hidden="true" />
                <b>غرف خاصة</b>
                <small>شارك الرمز وابدأ</small>
              </span>
            </div>
          </PrestigeStage>
        </section>

        <div className={styles.showcaseGrid} data-home-showcase>
          <section className={styles.gamesSection} aria-labelledby="featured-title">
            <div className={styles.sectionHead}>
              <span aria-hidden="true" />
              <h2 id="featured-title">اختَر تحدّيك القادم</h2>
              <span aria-hidden="true" />
            </div>
            <p className={styles.sectionIntro}>
              ذكاء، معرفة، أو منافسة على الطاولة. البداية على ذوقك.
            </p>
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

        <section
          className={worldStyles.section}
          id="mamluk-world"
          aria-labelledby="mamluk-title"
          data-scroll-reveal
        >
          <div className={styles.sectionHead}>
            <span aria-hidden="true" />
            <h2 id="mamluk-title">عالم المماليك</h2>
            <span aria-hidden="true" />
          </div>
          <figure className={worldStyles.world}>
            <div className={worldStyles.art}>
              <Image
                src="/game-art/kingdoms/village-oasis.webp"
                alt="قرية محصّنة بقصور وقباب وسط النخيل والأنهار في عالم المماليك"
                fill
                sizes="(max-width: 767px) 100vw, (max-width: 1440px) 58vw, 835px"
              />
            </div>
            <figcaption className={worldStyles.copy}>
              <span className={worldStyles.eyebrow}>
                <Castle aria-hidden="true" />
                من قريتك تبدأ الحكاية
              </span>
              <h3>
                ابنِ مملكتك،
                <br />
                واكتب تاريخك
              </h3>
              <p>طوّر قريتك، كوّن تحالفك، واستكشف خريطة العالم. كل قرار يرسم مستقبل مملكتك.</p>
              <ul className={worldStyles.features} aria-label="مزايا عالم المماليك">
                <li>بناء وتطوير</li>
                <li>تحالفات ومعارك</li>
                <li>خريطة عالم</li>
              </ul>
              <div className={worldStyles.actions}>
                <ButtonLink href="/games/kingdoms" variant="gold">
                  ادخل عالم المماليك
                  <ArrowLeft aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="/games/kingdoms/world-map" variant="outline">
                  <Globe2 aria-hidden="true" />
                  استكشف خريطة العالم
                </ButtonLink>
              </div>
            </figcaption>
          </figure>
        </section>

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
