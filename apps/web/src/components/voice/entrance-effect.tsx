'use client';

import Image from 'next/image';
import { useState } from 'react';
import { RealBadgeArtwork, RealEntranceArtwork } from '@/components/community/realistic-art';
import type { EntranceTier } from '@/lib/community/contracts';
import type { EntranceAnnouncement } from './entrance-queue';
import styles from './voice.module.css';

const TIER_LABELS: Record<EntranceTier, string> = {
  ordinary: 'أهلًا بك',
  silver: 'حضور فضي',
  gold: 'حضور ذهبي',
  diamond: 'حضور ماسي',
  royal: 'حضور ملكي',
  legend: 'حضور الأسطورة',
};

export function EntranceEffectPreview({
  tier,
  name = 'اسمك هنا',
  avatarUrl = null,
  badge,
  badgeId,
  effectAssetUrl,
  badgeAssetUrl,
  subdued = false,
}: {
  tier: EntranceTier;
  name?: string;
  avatarUrl?: string | null;
  badge?: string | null;
  badgeId?: string | null;
  effectAssetUrl?: string | null;
  badgeAssetUrl?: string | null;
  subdued?: boolean;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return (
    <RealEntranceArtwork
      tier={tier}
      assetUrl={effectAssetUrl}
      className={styles.entrance}
      subdued={subdued}
    >
      <span className={styles.entranceAvatar}>
        {avatarUrl && avatarUrl !== failedPhoto ? (
          <Image
            src={avatarUrl}
            alt=""
            width={48}
            height={48}
            unoptimized
            onError={() => setFailedPhoto(avatarUrl)}
          />
        ) : (
          <span>لم تُضف صورة</span>
        )}
      </span>
      <span className={styles.entranceCopy}>
        <small>{TIER_LABELS[tier]}</small>
        <strong>{name}</strong>
        {badge && (
          <span className={styles.entranceBadgeLine}>
            {(badgeId || badgeAssetUrl) && (
              <RealBadgeArtwork badgeId={badgeId || ''} assetUrl={badgeAssetUrl} name={badge} />
            )}
            <span>{badge}</span>
          </span>
        )}
      </span>
    </RealEntranceArtwork>
  );
}

export function EntranceOverlay({
  announcement,
  subdued,
}: {
  announcement: EntranceAnnouncement | null;
  subdued: boolean;
}) {
  if (!announcement) return null;
  return (
    <div className={styles.entranceOverlay} role="status" aria-live="polite" key={announcement.id}>
      <EntranceEffectPreview {...announcement} subdued={subdued} />
    </div>
  );
}
