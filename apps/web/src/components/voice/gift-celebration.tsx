'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { voiceGift } from '@/lib/voice/gifts';
import type { VoiceMessage } from '@/lib/voice/types';
import styles from './voice-gifts.module.css';
import effects from './room-effects.module.css';
import { EffectArt } from './effect-art';

/** Announce only a newly confirmed gift; never capture focus or block room controls. */
export function GiftCelebration({
  message,
  visible,
  onDismiss,
  count = 1,
  reduced = false,
  container,
}: {
  message: VoiceMessage | null;
  visible: boolean;
  count?: number;
  reduced?: boolean;
  container?: HTMLElement | null;
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
      className={`${styles.celebration} ${container ? effects.inlineCelebration : ''} v-room-scope`}
      key={message.id}
      data-effects-reduced={reduced}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={effects.compactGift} data-gift={gift.id}>
        <EffectArt kind={gift.id} large />
        <div>
          <small>هدية تجريبية مجانية</small>
          <strong>
            <bdi>{message.name}</bdi> أهدى {gift.name}
          </strong>
          <span>
            إلى <bdi>{message.gift.recipientName}</bdi>
          </span>
        </div>
        <span className={effects.count} dir="ltr">
          ×{count}
        </span>
        <button
          type="button"
          className={effects.dismiss}
          aria-label="إغلاق تأثير الهدية"
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      </div>
    </aside>,
    container ?? document.body,
  );
}
