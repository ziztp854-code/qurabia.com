'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { EntranceEffectPreview } from '@/components/community-voice/entrance-effect';
import type { VoiceParticipant, VoiceSnapshot } from '@/lib/voice/types';
import styles from './voice-enhancements.module.css';
import { EffectArt } from './effect-art';
import effects from './room-effects.module.css';
import { MemberName } from './member-name';

export type VoiceArrival = { member: VoiceParticipant; key: string; expiresAt: number };

/** Compare accepted server snapshots; an initial room view isn't a mass arrival. */
export function voiceArrivals(
  previous: VoiceSnapshot | null,
  next: VoiceSnapshot,
): VoiceParticipant[] {
  if (!next.me || !next.room.active) return [];
  if (!previous?.me || previous.room.id !== next.room.id) return [next.me];
  const known = new Map(previous.participants.map((member) => [member.id, member.joinedAt]));
  return next.participants.filter((member) => known.get(member.id) !== member.joinedAt);
}

export function voiceEntranceRank(member: VoiceParticipant) {
  return (
    (['owner', 'admin', 'sultan', 'prince', 'knight'] as const).find((rank) =>
      member.accountBadges?.includes(rank),
    ) ?? 'member'
  );
}
const rankLabels = {
  owner: 'دخول مالك المنصة',
  admin: 'دخول إدارة المنصة',
  sultan: 'دخول السلطان',
  prince: 'دخول الأمير',
  knight: 'دخول الفارس',
  member: 'نورت المجلس',
};

export function MemberEntrance({
  arrival,
  visible,
  selfId,
  onDismiss,
  reduced = false,
}: {
  arrival?: VoiceArrival;
  visible: boolean;
  reduced?: boolean;
  selfId: string;
  onDismiss: () => void;
}) {
  const [settings, setSettings] = useState({ entranceEnabled: true, reduceEffects: false });
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/community/me', { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (result?.ok && result.data?.settings && !controller.signal.aborted) {
          setSettings({
            entranceEnabled: result.data.settings.entranceEnabled !== false,
            reduceEffects: result.data.settings.reduceEffects === true,
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!arrival) return;
    const timer = window.setTimeout(
      onDismiss,
      Math.max(
        0,
        Math.min(
          voiceEntranceRank(arrival.member) === 'member' ? 1600 : 2600,
          arrival.expiresAt - Date.now(),
        ),
      ),
    );
    return () => window.clearTimeout(timer);
  }, [arrival, onDismiss]);
  if (!arrival || !settings.entranceEnabled) return null;
  const { member } = arrival;
  const rank = voiceEntranceRank(member);
  const premium = rank !== 'member';
  const identity = member.communityIdentity;
  return (
    <aside
      key={arrival.key}
      className={`${styles.entrance} ${styles.photographicEntrance}`}
      data-rank={rank}
      data-effects-reduced={reduced}
      data-premium={premium || undefined}
      hidden={!visible}
      dir="rtl"
      aria-label="ترحيب بالأعضاء"
    >
      {premium && (
        <span className={effects.entranceAccent}>
          <EffectArt
            kind={
              rank === 'sultan' || rank === 'owner'
                ? 'crown'
                : rank === 'prince'
                  ? 'car'
                  : rank === 'admin'
                    ? 'portal'
                    : 'meteor'
            }
          />
        </span>
      )}
      <div role="status" aria-live="polite" aria-atomic="true">
        <span className={styles.arrivalContext}>
          {member.id === selfId ? 'حيّاك ' : 'وصل الآن '}
          {premium ? 'دخول مميز · ' : ''}
          {rankLabels[rank]}
          <MemberName name="" badges={member.accountBadges} showRankBadge={false} />
          {identity?.accountNumber != null ? ` · ID ${identity.accountNumber}` : ''}
        </span>
        <EntranceEffectPreview
          subdued={settings.reduceEffects || reduced}
          tier={identity?.effect?.tier ?? 'ordinary'}
          effectAssetUrl={identity?.effect?.assetUrl}
          name={member.name}
          avatarUrl={identity?.avatarUrl || member.image}
          badgeId={identity?.primaryBadge?.id}
          badgeAssetUrl={identity?.primaryBadge?.assetUrl}
          badge={identity?.primaryBadge?.name}
        />
      </div>
      <button type="button" onClick={onDismiss} aria-label="إخفاء شارة الدخول">
        <X size={18} />
      </button>
    </aside>
  );
}
