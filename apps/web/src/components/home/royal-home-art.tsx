import { Crown } from 'lucide-react';
import Image from 'next/image';
import styles from './prestige-home.module.css';

export function RoyalHomeWordmark() {
  return (
    <Image
      className={styles.royalWordmark}
      src="/home/studio-wordmark.webp"
      alt=""
      width={1200}
      height={306}
      sizes="(max-width: 767px) 48vw, (max-width: 1239px) 31vw, 384px"
      priority
    />
  );
}

export function RoyalHomeOrnaments() {
  return (
    <div className={styles.royalOrnaments} aria-hidden="true">
      <Image
        className={styles.royalTrophy}
        src="/home/studio-trophy.webp"
        alt=""
        width={747}
        height={1200}
        sizes="(max-width: 767px) 14vw, (max-width: 1239px) 15vw, (max-width: 1540px) 17vw, 250px"
      />
      <Image
        className={styles.royalLion}
        src="/home/studio-lion.webp"
        alt=""
        width={788}
        height={1200}
        sizes="(max-width: 767px) 18vw, (max-width: 1540px) 22vw, 328px"
      />
    </div>
  );
}

export function RoyalHomeQr() {
  return (
    <aside className={styles.royalHoo} aria-label="دعوة Hoo Live">
      <span className={styles.royalHooCrest} aria-hidden="true">
        <Crown size={17} strokeWidth={1.75} />
      </span>
      <Image
        src="/home/royal-hoo-qr.png"
        alt="رمز QR لدعوة Hoo Live"
        width={345}
        height={345}
        unoptimized
      />
      <span className={styles.royalHooName} lang="en" dir="ltr">
        Hoo Live
      </span>
    </aside>
  );
}
