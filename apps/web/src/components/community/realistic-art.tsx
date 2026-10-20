import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import type { EntranceTier } from '@/lib/community/contracts';
import styles from './realistic-art.module.css';

const BADGE_ATLAS = '/community-assets/badge-atlas.webp';
const FRAME_ATLAS = '/community-assets/frame-atlas.webp';
const ENTRANCE_ATLAS = '/community-assets/entrance-atlas.webp';

// Atlas order is shared with the built-in catalog: six columns and three rows.
export const REAL_BADGE_IDS = [
  'platform-founder',
  'general-manager',
  'platform-moderator',
  'room-moderator',
  'diamond-member',
  'gold-member',
  'royal-member',
  'elite-member',
  'vip-member',
  'challenge-champion',
  'weekly-leader',
  'tournament-winner',
  'achievement-holder',
  'distinguished-member',
  'content-creator',
  'distinguished-host',
  'supporter',
  'veteran-member',
] as const;
const FRAME_TIERS: readonly EntranceTier[] = [
  'ordinary',
  'silver',
  'gold',
  'diamond',
  'royal',
  'legend',
];

function customImage(value: string | null | undefined, atlas: string): string | null {
  const normalized = value?.split('#')[0].replace(/\.(png|webp)$/, '');
  if (
    !value ||
    normalized === atlas.replace(/\.(png|webp)$/, '') ||
    /^\/profile\/badge-[a-z-]+\.png$/.test(value)
  )
    return null;
  return /^(?:https:\/\/|\/(?!\/)|data:image\/(?:png|webp);base64,)/i.test(value) ? value : null;
}
function atlasStyle(index: number, columns: number, rows: number, url: string): CSSProperties {
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${(column / (columns - 1)) * 100}% ${(row / (rows - 1)) * 100}%`,
  };
}

export function RealBadgeArtwork({
  badgeId,
  assetUrl,
  name,
  className,
}: {
  badgeId: string;
  assetUrl?: string | null;
  name: string;
  className?: string;
}) {
  const image = customImage(assetUrl, BADGE_ATLAS);
  if (image)
    return (
      <span className={`${styles.badge} ${className ?? ''}`}>
        <Image src={image} alt={name} width={96} height={96} unoptimized />
      </span>
    );
  const index = REAL_BADGE_IDS.indexOf(badgeId as (typeof REAL_BADGE_IDS)[number]);
  if (index < 0)
    return (
      <span
        className={`${styles.missing} ${className ?? ''}`}
        aria-label={`صورة ${name} غير مضافة`}
      >
        صورة غير مضافة
      </span>
    );
  return (
    <span
      className={`${styles.badge} ${styles.atlas} ${className ?? ''}`}
      role="img"
      aria-label={name}
      data-badge-id={badgeId}
      style={atlasStyle(index, 6, 3, BADGE_ATLAS)}
    />
  );
}

export function RealFrameArtwork({
  tier,
  assetUrl,
  name,
  className,
}: {
  tier: EntranceTier;
  assetUrl?: string | null;
  name?: string;
  className?: string;
}) {
  const image = customImage(assetUrl, FRAME_ATLAS);
  if (image)
    return (
      <span className={`${styles.frame} ${className ?? ''}`} aria-hidden={name ? undefined : true}>
        <Image src={image} alt={name ?? ''} width={160} height={160} unoptimized />
      </span>
    );
  const index = Math.max(0, FRAME_TIERS.indexOf(tier));
  return (
    <span
      className={`${styles.frame} ${styles.atlas} ${className ?? ''}`}
      role={name ? 'img' : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      data-frame-tier={tier}
      style={atlasStyle(index, 3, 2, FRAME_ATLAS)}
    />
  );
}

// The generated source is 1774 × 887. Individual trims retain the crowns that
// extend beyond nominal row boundaries without stretching the metal artwork.
const ENTRANCE_CROPS = [
  { top: 0, height: 270, avatarX: 22, avatarY: 56 },
  { top: 0, height: 307, avatarX: 20, avatarY: 53 },
  { top: 264, height: 311, avatarX: 21, avatarY: 63 },
  { top: 295, height: 294, avatarX: 20, avatarY: 56 },
  { top: 568, height: 319, avatarX: 20, avatarY: 59 },
  { top: 568, height: 319, avatarX: 20, avatarY: 58 },
] as const;

export function RealEntranceArtwork({
  tier,
  assetUrl,
  name,
  className,
  children,
  subdued = false,
}: {
  tier: EntranceTier;
  assetUrl?: string | null;
  name?: string;
  className?: string;
  children?: ReactNode;
  subdued?: boolean;
}) {
  const index = Math.max(0, FRAME_TIERS.indexOf(tier));
  const crop = ENTRANCE_CROPS[index];
  const image = customImage(assetUrl, ENTRANCE_ATLAS);
  const style = {
    '--entrance-avatar-x': `${crop.avatarX}%`,
    '--entrance-avatar-y': `${crop.avatarY}%`,
  } as CSSProperties;
  const artworkStyle: CSSProperties = image
    ? {}
    : {
        backgroundImage: `url("${ENTRANCE_ATLAS}")`,
        backgroundSize: `200% ${(887 / crop.height) * 100}%`,
        backgroundPosition: `${(index % 2) * 100}% ${(crop.top / (887 - crop.height)) * 100}%`,
        blockSize: `${(crop.height / (887 / 3)) * 100}%`,
        insetBlockStart: `${(1 - crop.height / (887 / 3)) * 50}%`,
        // Mask neighboring atlas ornaments without trimming individual uploaded images.
        clipPath:
          index === 2
            ? 'inset(0 0 3% 0)'
            : index === 3
              ? 'inset(0 0 6% 0)'
              : index === 5
                ? 'polygon(0 9%, 17% 9%, 17% 0, 24% 0, 24% 9%, 100% 9%, 100% 100%, 0 100%)'
                : undefined,
      };
  return (
    <span
      className={`${styles.entranceBoard} ${className ?? ''}`}
      dir="rtl"
      data-entrance-tier={tier}
      data-subdued={subdued || undefined}
      style={style}
    >
      <span
        className={`${styles.entrancePlate} ${image ? styles.customEntrance : ''}`}
        role={name ? 'img' : undefined}
        aria-label={name}
        aria-hidden={name ? undefined : true}
        style={artworkStyle}
      >
        {image && <Image src={image} alt="" fill unoptimized sizes="512px" />}
      </span>
      {children}
    </span>
  );
}
