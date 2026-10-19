'use client';

import Link from 'next/link';
import { AudioLines, Headphones, Mic, MicOff, Users } from 'lucide-react';
import type { VoiceParticipant } from '@/lib/voice/types';
import { Avatar } from './voice-ui';
import { MemberName } from './member-name';
import { number, roleLabels } from './voice-client';
import styles from './live-room.module.css';

/** Presentation only: membership and profile actions remain owned by VoiceRoomView. */
export function VoiceRoomAudience({
  participants,
  speakers,
  onProfile,
  onMembers,
  inert = false,
}: {
  participants: VoiceParticipant[];
  speakers: string[];
  onProfile: (id: string) => void;
  onMembers: () => void;
  inert?: boolean;
}) {
  return (
    <aside className={styles.audienceRail} aria-label="الحاضرون والتنقل" inert={inert}>
      <nav className={styles.audienceNav} aria-label="تنقل المجلس">
        <Link href="/voice">
          <Headphones size={18} aria-hidden="true" /> استكشاف الغرف
        </Link>
        <Link href="/voice?view=favorites">
          <Users size={18} aria-hidden="true" /> غرفي المفضلة
        </Link>
      </nav>
      <header className={styles.audienceHeader}>
        <h2>
          الحاضرون <span>{number(participants.length)}</span>
        </h2>
        <button
          type="button"
          className="v-icon"
          aria-label="عرض جميع أعضاء الغرفة"
          onClick={onMembers}
        >
          <Users size={18} aria-hidden="true" />
        </button>
      </header>
      <div className={styles.audienceList}>
        {participants.slice(0, 24).map((person) => {
          const muted = person.muted || person.moderatorMuted;
          const speaking = speakers.includes(person.id);
          const state = speaking
            ? 'يتحدث الآن'
            : person.seatIndex === null
              ? 'يستمع'
              : muted
                ? 'مكتوم'
                : 'المايك مفتوح';
          const Icon = speaking
            ? AudioLines
            : person.seatIndex === null
              ? Headphones
              : muted
                ? MicOff
                : Mic;
          return (
            <button
              key={person.id}
              type="button"
              className={styles.audienceMember}
              onClick={() => onProfile(person.id)}
              aria-label={`ملف ${person.name}، ${roleLabels[person.role]}، ${state}`}
            >
              <Avatar user={person} size={40} speaking={speaking} />
              <span className={styles.audienceIdentity}>
                <MemberName name={person.name} badges={person.accountBadges} />
                <small>
                  {roleLabels[person.role]} · {state}
                </small>
              </span>
              <Icon size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {participants.length > 24 && (
        <button className="v-text-button" onClick={onMembers}>
          عرض بقية الحاضرين
        </button>
      )}
    </aside>
  );
}
