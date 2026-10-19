'use client';

import Link from 'next/link';
import { Gamepad2, Headphones, LogOut, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VoiceSnapshot } from '@/lib/voice/types';
import styles from './persistent-voice-dock.module.css';

export function PersistentVoiceDock({
  snapshot,
  deafened,
  busy,
  muteBusy = false,
  visible,
  overlayActive = false,
  audioSettingsOpen = false,
  onAudioSettingsOpenChange,
  error,
  mediaPending,
  onMute,
  onDeafen,
  onLeave,
  children,
}: {
  snapshot: VoiceSnapshot;
  deafened: boolean;
  busy: boolean;
  muteBusy?: boolean;
  visible: boolean;
  overlayActive?: boolean;
  audioSettingsOpen?: boolean;
  onAudioSettingsOpenChange?: (open: boolean) => void;
  error: string;
  mediaPending: boolean;
  onMute: () => void;
  onDeafen: () => void;
  onLeave: () => void;
  children: ReactNode;
}) {
  const { me, room } = snapshot;
  const admitted = Boolean(room.active && me);
  const canSpeak = Boolean(admitted && me?.seatIndex !== null && me?.role !== 'listener');
  const muted = !canSpeak || Boolean(me?.muted || me?.moderatorMuted);
  return (
    <aside
      className={`v-player ${styles.dock} ${visible ? styles.inRoom : ''}`}
      data-audio-open={audioSettingsOpen}
      inert={visible && overlayActive}
      dir="rtl"
      aria-label="جلسة الصوت المستمرة"
    >
      <div className={styles.heading}>
        <Headphones aria-hidden="true" />
        <div>
          <strong>{room.name}</strong>
          <span>
            {!room.active
              ? 'انتهى اللقاء الصوتي'
              : !me
                ? 'انتهت عضويتك في الغرفة'
                : me.moderatorMuted
                  ? 'كتم المشرف الميكروفون'
                  : 'يمكنك متابعة اللعب من الجلسة الحالية'}
          </span>
        </div>
      </div>
      <nav className={styles.actions} aria-label="التحكم بالصوت أثناء اللعب">
        {!visible && <Link href={`/voice/${room.id}`}>العودة للغرفة</Link>}
        <Link href="/games/" className={styles.games}>
          <Gamepad2 size={18} aria-hidden="true" />
          الألعاب
        </Link>
        <button
          type="button"
          aria-label={muted ? 'تشغيل المايك أثناء اللعب' : 'كتم المايك أثناء اللعب'}
          aria-pressed={muted}
          disabled={!canSpeak || me?.moderatorMuted || muteBusy}
          onClick={onMute}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
          <span>{muted ? 'تشغيل المايك' : 'كتم المايك'}</span>
        </button>
        <button
          type="button"
          aria-label={deafened ? 'تشغيل سماعات الغرفة' : 'كتم سماعات الغرفة'}
          aria-pressed={deafened}
          onClick={onDeafen}
        >
          {deafened ? <VolumeX size={18} /> : <Volume2 size={18} />}
          <span>{deafened ? 'تشغيل الاستماع' : 'كتم الاستماع'}</span>
        </button>
        <button type="button" className={styles.leave} disabled={busy} onClick={onLeave}>
          <LogOut size={18} aria-hidden="true" />
          {admitted ? 'مغادرة الصوت' : 'إغلاق جلسة الصوت'}
        </button>
      </nav>
      <div className={styles.audio}>
        <details
          open={visible ? audioSettingsOpen : true}
          onToggle={(event) => {
            if (visible) onAudioSettingsOpenChange?.(event.currentTarget.open);
          }}
        >
          <summary>
            <Headphones size={17} /> الصوت والأجهزة
          </summary>
          {children}
        </details>
      </div>
      {!visible && error && (
        <p role="alert" className={styles.warning}>
          {error}
        </p>
      )}
      {!visible && mediaPending && (
        <p role="status" className={styles.warning}>
          جارٍ التأكد من تطبيق صلاحيات الصوت.
        </p>
      )}
    </aside>
  );
}
