import { Crown } from 'lucide-react';
import Image from 'next/image';
import styles from './prestige-home.module.css';

export function RoyalHomeWordmark() {
  return (
    <Image
      className={styles.royalWordmark}
      src="/home/royal-wordmark.webp"
      alt=""
      width={625}
      height={355}
      sizes="(max-width: 767px) 52vw, 27vw"
      priority
    />
  );
}

export function RoyalHomeOrnaments() {
  return (
    <div className={styles.royalOrnaments} aria-hidden="true">
      <Image
        className={styles.royalFabric}
        src="/home/royal-fabric.webp"
        alt=""
        width={210}
        height={150}
        sizes="(max-width: 767px) 15vw, 11vw"
      />
      <Image
        className={styles.royalTrophy}
        src="/home/royal-trophy.webp"
        alt=""
        width={480}
        height={755}
        sizes="(max-width: 767px) 22vw, 19vw"
      />
      <Image
        className={styles.royalLion}
        src="/home/royal-seated-lion.webp"
        alt=""
        width={934}
        height={1100}
        sizes="(max-width: 767px) 25vw, 30vw"
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
