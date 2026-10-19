'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { LogIn, Sparkles, X } from 'lucide-react';
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
  const emblem = rank === 'sultan' || rank === 'prince' || rank === 'knight';
  return (
    <aside
      className={styles.entrance}
      data-rank={rank}
      hidden={!visible}
      dir="rtl"
      aria-label="ترحيب بالأعضاء"
    >
      <div className={styles.seal} aria-hidden="true">
        {emblem ? (
          <Image src={`/ranks/emblem-${rank}.png`} width={56} height={56} alt="" />
        ) : (
          <Sparkles size={20} />
        )}
      </div>
      <Avatar user={member} size={42} />
      <div className={styles.welcome} role="status" aria-live="polite" aria-atomic="true">
        <small>{rankLabels[rank]}</small>
        <p>
          {member.id === selfId ? 'حيّاك ' : 'وصل الآن '}
          <MemberName name={member.name} badges={member.accountBadges} />
        </p>
      </div>
      <LogIn className={styles.arrivalIcon} size={19} aria-hidden="true" />
      <button type="button" onClick={onDismiss} aria-label="إخفاء شارة الدخول">
        <X size={18} />
      </button>
    </aside>
  );
}
