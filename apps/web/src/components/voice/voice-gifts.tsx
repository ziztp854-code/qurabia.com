'use client';

import { useState, type FormEvent } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { Dialog } from '@/components/ui/overlay';
import { VOICE_GIFTS, voiceGift, type VoiceGiftId } from '@/lib/voice/gifts';
import type { VoiceEvent, VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import styles from './voice-gifts.module.css';

export function VoiceGifts({
  participants,
  selfId,
  initialRecipientId,
  enabled,
  onEvent,
  onClose,
}: {
  participants: VoiceParticipant[];
  selfId: string;
  initialRecipientId?: string;
  enabled: boolean;
  onEvent: (event: VoiceEvent) => Promise<void>;
  onClose: () => void;
}) {
  const [recipientId, setRecipientId] = useState(
    initialRecipientId ?? participants.find((p) => p.id !== selfId)?.id ?? selfId,
  );
  const [giftId, setGiftId] = useState<VoiceGiftId>('rose');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const recipient = participants.find((p) => p.id === recipientId);
  const selected = voiceGift(giftId)!;
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!recipient || !enabled || sending) return;
    setSending(true);
    setError('');
    setSent('');
    try {
      await onEvent({ type: 'gift', giftId, recipientId });
      setSent(`أُرسلت ${selected.name} إلى ${recipient.name}. ظهرت الهدية في دردشة الغرفة.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر إرسال الهدية. حاول مجددًا.');
    } finally {
      setSending(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title="الهدايا التجريبية"
      className={`v-dialog ${styles.dialog}`}
    >
      <form className={styles.form} onSubmit={(event) => void send(event)}>
        <div className={styles.preview} aria-label="معاينة الهدية">
          <span className={styles.previewArt} aria-hidden="true">
            {selected.emoji}
          </span>
          <div>
            <span className={styles.eyebrow}>
              <Sparkles size={14} /> لحظة تستحق هدية
            </span>
            <h3>{selected.name}</h3>
            <p>
              {recipient ? (
                <>
                  إلى <bdi>{recipient.name}</bdi>، بكل تقدير
                </>
              ) : (
                'اختر عضوًا موجودًا في الغرفة'
              )}
            </p>
          </div>
        </div>
        <p className={styles.trial}>
          <Gift size={20} /> جميع الهدايا مجانية للتجربة، دون شراء أو خصم رصيد.
        </p>
        <label className={styles.recipient}>
          إلى من ترسل الهدية؟
          <select
            value={recipientId}
            disabled={sending}
            onChange={(event) => {
              setRecipientId(event.target.value);
              setSent('');
              setError('');
            }}
          >
            {!recipient && (
              <option value={recipientId} disabled>
                غادر العضو الغرفة
              </option>
            )}
            {participants.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.id === selfId ? ' (أنت — للتجربة)' : ''}
              </option>
            ))}
          </select>
        </label>
        <fieldset className={styles.choices} disabled={sending}>
          <legend>اختر هديتك</legend>
          <div>
            {VOICE_GIFTS.map((gift) => (
              <label key={gift.id} className={styles.choice}>
                <input
                  type="radio"
                  name="voice-gift"
                  value={gift.id}
                  checked={giftId === gift.id}
                  onChange={() => {
                    setGiftId(gift.id);
                    setSent('');
                    setError('');
                  }}
                />
                <span aria-hidden="true">{gift.emoji}</span>
                <strong>{gift.name}</strong>
                <small>مجانية</small>
              </label>
            ))}
          </div>
        </fieldset>
        <p className={styles.hint}>
          تظهر الهدية لأعضاء الغرفة في الدردشة. يمكنك الإرسال مرة كل خمس ثوانٍ.
        </p>
        {!enabled && <p role="status">الهدايا متاحة للأعضاء أثناء فتح الدردشة فقط.</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {sent && (
          <p className={styles.success} role="status">
            {sent}
          </p>
        )}
        <button className="v-button" type="submit" disabled={sending || !enabled || !recipient}>
          <Gift size={18} />
          {sending ? 'جارٍ الإرسال…' : `إرسال ${selected.name} مجانًا`}
        </button>
      </form>
    </Dialog>
  );
}

export function GiftReceipt({ message }: { message: VoiceMessage }) {
  const gift = message.gift && voiceGift(message.gift.id);
  if (!gift || !message.gift) return <p>{message.text}</p>;
  return (
    <div className={styles.receipt}>
      <span className={styles.giftEmoji} aria-hidden="true">
        {gift.emoji}
      </span>
      <div>
        <strong>هدية {gift.name}</strong>
        <p>
          <bdi>{message.name}</bdi> أهدى <bdi>{message.gift.recipientName}</bdi>
        </p>
        <small>هدية تجريبية مجانية</small>
      </div>
    </div>
  );
}
