import Image from 'next/image';
import type { Resource } from '@/lib/kingdoms/types';
import styles from './resource-icon.module.css';

const photographs: Record<Resource, string> = {
  wood: '/game-art/kingdoms/resource-wood.webp',
  stone: '/game-art/kingdoms/resource-stone.webp',
  food: '/game-art/kingdoms/resource-wheat.webp',
  iron: '/game-art/kingdoms/resource-iron.webp',
  gold: '/game-art/kingdoms/resource-gold.webp',
};

export function ResourceIcon({
  resource,
  size = 28,
  hud = false,
}: {
  resource: Resource;
  size?: 24 | 28 | 32;
  hud?: boolean;
}) {
  const src = photographs[resource];
  return (
    <i
      className={`${styles.icon} ${hud ? styles.hud : ''}`}
      style={{ inlineSize: size, blockSize: size }}
      aria-hidden="true"
    >
      <Image src={src} alt="" width={size} height={size} className={styles.photo} />
    </i>
  );
}
