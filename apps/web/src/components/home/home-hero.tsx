import { ArrowLeft, Gamepad2, QrCode, Trophy, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { PlanCode } from '@tahaddi/domain';
import { ButtonLink } from '@/components/ui';
import { InstallAppButton } from '@/components/pwa/install-app-button';
import { GradientText } from '@/components/react-bits/gradient-text';
import { Magnet } from '@/components/react-bits/magnet';
import { PrestigeStage } from './prestige-stage';
import { RoomCodeShortcut } from './room-code-shortcut';
import styles from './prestige-home.module.css';

const RANK_EMBLEM: Record<PlanCode, string> = {
  SPECTATOR: '/ranks/emblem-spectator.png',
  KNIGHT: '/ranks/emblem-knight.png',
  PRINCE: '/ranks/emblem-prince.png',
  SULTAN: '/ranks/emblem-sultan.png',
};

export type HomeRank = {
  code: string;
  name: string;
  emblem: string;
};

export function HomeHero({ rank }: { rank: HomeRank | null }) {
  return (
    <section className={styles.hero} id="top" aria-labelledby="landing-title">
      <PrestigeStage>
        <div className={styles.copy}>
          <h1 id="landing-title">
            <GradientText>تحدي</GradientText>
            <span className={styles.heroPromise}>جمعتكم تبدأ بلعبة.</span>
          </h1>
          <p className={styles.tagline}>اختر تحدّيك، اجمع أصدقاءك، وشاركهم جولة تستحق المنافسة.</p>
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
  );
}
