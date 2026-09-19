import { ArrowLeft, Crown, Gamepad2, QrCode, Trophy, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { PrestigeStage } from '@/components/home/prestige-stage';
import { RoomCodeShortcut } from '@/components/home/room-code-shortcut';
import { SiteLayout, type HeaderUser } from '@/components/layout';
import { ButtonLink } from '@/components/ui';
import { publicNavigation } from '@/config/navigation';
import { publicGames } from '@/data/games';
import { PLAN_CODES, planDefinition, type PlanCode } from '@tahaddi/domain';
import { formatNumber } from '@/lib/utils';
import styles from './prestige-home.module.css';

const RANK_IMAGE: Record<PlanCode, string> = {
  SPECTATOR: '/ranks/spectator.png',
  KNIGHT: '/ranks/knight.png',
  PRINCE: '/ranks/prince.png',
  SULTAN: '/ranks/sultan.png',
};

const featuredGameIds = ['chess', 'baloot', 'millionaire', 'letter-challenge'] as const;
const featuredGames = featuredGameIds.flatMap((id) => {
  const game = publicGames.find((item) => item.id === id);
  return game ? [game] : [];
});
const productionGames = publicGames.filter((game) => game.status !== 'soon');
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
              <h1 id="landing-title">تحدي</h1>
              <p className={styles.tagline}>
                منصة مسابقات وألعاب جماعية عربية مباشرة، حيث يُصنع الأبطال وتُسجّل إنجازاتهم
              </p>
              {rank ? (
                <Link
                  href="/orders"
                  className={styles.rankBadge}
                  data-plan={rank.code}
                  aria-label={`رتبتك ${rank.name} — فتح قاعة الأوسمة`}
                >
                  <span aria-hidden="true">{rank.emblem}</span>
                  <b>{rank.name}</b>
                </Link>
              ) : null}
              <div className={styles.actions}>
                <ButtonLink href="/games" variant="gold">
                  ابدأ اللعب الآن
                  <ArrowLeft aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href="/join" variant="outline">
                  انضم برمز
                  <QrCode aria-hidden="true" />
                </ButtonLink>
              </div>
              <RoomCodeShortcut />
            </div>

            <div className={styles.values} role="list" aria-label="مزايا المنصة">
              <span role="listitem">
                <Zap aria-hidden="true" />
                <b>تحديات مباشرة</b>
                <small>على مدار الساعة</small>
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
              <h2 id="featured-title">الألعاب الأبرز</h2>
              <span aria-hidden="true" />
            </div>
            <nav className={styles.games} aria-label="ألعاب بارزة">
              {featuredGames.map((game) => (
                <Link className={styles.game} href={game.href} key={game.href}>
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

        <section className={styles.plansSection} aria-labelledby="plans-title">
          <div className={styles.sectionHead}>
            <span aria-hidden="true" />
            <h2 id="plans-title">رُتب البلاط والاشتراكات</h2>
            <span aria-hidden="true" />
          </div>
          <div className={styles.plans}>
            {PLAN_CODES.map((code) => {
              const plan = planDefinition(code);
              const isCurrent = rank?.code === code;
              return (
                <Link
                  key={code}
                  href="/orders"
                  className={styles.planCard}
                  data-plan={code}
                  data-current={isCurrent}
                  aria-label={`رتبة ${plan.name} — ${
                    plan.monthlyPriceSar === 0
                      ? 'مجانًا'
                      : `${formatNumber(plan.monthlyPriceSar)} ريال شهريًا`
                  } — فتح قاعة الأوسمة`}
                >
                  <Image
                    className={styles.planImage}
                    src={RANK_IMAGE[code]}
                    alt={`بطاقة رتبة ${plan.name}`}
                    width={1024}
                    height={1536}
                    sizes="(max-width: 640px) 88vw, (max-width: 1024px) 44vw, 23vw"
                  />
                  {isCurrent ? <span className={styles.planCurrentFlag}>رتبتك الحالية</span> : null}
                </Link>
              );
            })}
          </div>
        </section>

        <section className={styles.closingCta} aria-label="استمر في التحدي">
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
          {publicNavigation.map((item) => (
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
