'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { voiceGift } from '@/lib/voice/gifts';
import type { VoiceMessage } from '@/lib/voice/types';
import styles from './voice-gifts.module.css';

/** Announce only a newly confirmed gift; never capture focus or block room controls. */
export function GiftCelebration({
  message,
  visible,
  onDismiss,
}: {
  message: VoiceMessage | null;
  visible: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  const gift = message?.gift && voiceGift(message.gift.id);
  if (!visible || !message?.gift || !gift) return null;
  return createPortal(
    <aside
      className={`${styles.celebration} v-room-scope`}
      key={message.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles.celebrationCard}>
        <button type="button" aria-label="إغلاق تأثير الهدية" onClick={onDismiss}>
          <X size={18} />
        </button>
        <span
          className={`${styles.photo} ${styles.celebrationArt}`}
          data-gift={gift.id}
          aria-hidden="true"
        />
        <strong>
          <bdi>{message.name}</bdi> أهدى {gift.name}
        </strong>
        <span>
          إلى <bdi>{message.gift.recipientName}</bdi>
        </span>
      </div>
    </aside>,
    document.body,
  );
}
