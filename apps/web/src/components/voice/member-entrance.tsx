'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { BadgeCheck, LogIn, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { VoiceParticipant, VoiceSnapshot } from '@/lib/voice/types';
import { MemberName } from './member-name';
import { Avatar } from './voice-ui';
import styles from './voice-enhancements.module.css';

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
}: {
  arrival?: VoiceArrival;
  visible: boolean;
  selfId: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!arrival) return;
    const timer = window.setTimeout(onDismiss, Math.max(0, arrival.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [arrival, onDismiss]);
  if (!arrival) return null;
  const { member } = arrival;
  const rank = voiceEntranceRank(member);
  const premium = rank !== 'member';
  const emblem = rank === 'owner' || rank === 'sultan' || rank === 'prince' || rank === 'knight';
  return (
    <aside
      key={arrival.key}
      className={styles.entrance}
      data-rank={rank}
      data-premium={premium || undefined}
      hidden={!visible}
      dir="rtl"
      aria-label="ترحيب بالأعضاء"
    >
      <span className={styles.entranceLight} aria-hidden="true" />
      <div className={styles.seal}>
        {emblem ? (
          <Image
            src={rank === 'owner' ? '/ranks/emblem-owner.png' : `/ranks/emblem-${rank}.png`}
            width={rank === 'owner' ? 96 : 56}
            height={rank === 'owner' ? 96 : 56}
            alt=""
          />
        ) : rank === 'admin' ? (
          <ShieldCheck size={23} aria-hidden="true" />
        ) : (
          <Sparkles size={20} aria-hidden="true" />
        )}
        {rank === 'owner' && member.accountBadges?.includes('verified') && (
          <span
            className={styles.ownerVerification}
            role="img"
            aria-label="مالك المنصة موثّق"
            title="مالك المنصة موثّق"
          >
            <BadgeCheck size={22} aria-hidden="true" />
          </span>
        )}
      </div>
      <Avatar user={member} size={42} />
      <div className={styles.welcome} role="status" aria-live="polite" aria-atomic="true">
        <small className={styles.entranceHeading}>
          {premium && (
            <span className={styles.premiumLabel}>
              <Sparkles size={12} aria-hidden="true" /> دخول مميز
            </span>
          )}
          <span>{rankLabels[rank]}</span>
        </small>
        <p>
          {member.id === selfId ? 'حيّاك ' : 'وصل الآن '}
          <MemberName
            name={member.name}
            badges={member.accountBadges}
            showRankBadge={rank !== 'owner'}
            showVerificationBadge={rank !== 'owner'}
          />
        </p>
        {premium && <span className={styles.ownerSignature}>تحدّي لايف</span>}
      </div>
      <LogIn className={styles.arrivalIcon} size={19} aria-hidden="true" />
      <button type="button" onClick={onDismiss} aria-label="إخفاء شارة الدخول">
        <X size={18} />
      </button>
    </aside>
  );
}
