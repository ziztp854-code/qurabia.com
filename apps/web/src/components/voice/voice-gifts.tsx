'use client';

import { MotionConfig } from 'framer-motion';
import { useRef, useState, type FormEvent } from 'react';
import { EffectArt } from './effect-art';
import { Gift, Sparkles, Trophy } from 'lucide-react';
import { Dialog } from '@/components/ui/overlay';
import { VOICE_GIFTS, voiceGift, type VoiceGiftId } from '@/lib/voice/gifts';
import { giftRanking } from '@/lib/voice/gift-ranking';
import type { VoiceEvent, VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import styles from './voice-gifts.module.css';

export function VoiceGifts({
  participants,
  messages = [],
  selfId,
  initialRecipientId,
  enabled,
  onEvent,
  onClose,
  reduced = false,
}: {
  participants: VoiceParticipant[];
  messages?: VoiceMessage[];
  selfId: string;
  initialRecipientId?: string;
  enabled: boolean;
  reduced?: boolean;
  onEvent: (event: VoiceEvent) => Promise<void>;
  onClose: () => void;
}) {
  const [recipientId, setRecipientId] = useState(
    initialRecipientId ?? participants.find((p) => p.id !== selfId)?.id ?? selfId,
  );
  const [giftId, setGiftId] = useState<VoiceGiftId>('rose');
  const [view, setView] = useState<'send' | 'ranking'>('send');
  const request = useRef<{ key: string; id: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const recipient = participants.find((p) => p.id === recipientId);
  const selected = voiceGift(giftId)!;
  const ranking = giftRanking(messages);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!recipient || !enabled || sending) return;
    setSending(true);
    setError('');
    try {
      const key = `${giftId}:${recipientId}`;
      if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
      await onEvent({ type: 'gift', giftId, recipientId, requestId: request.current.id });
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'تعذر إرسال الهدية. حاول مجددًا.');
    } finally {
      setSending(false);
    }
  }
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      <Dialog
        open
        onOpenChange={onClose}
        title="الهدايا التجريبية"
        className={`v-dialog ${styles.dialog}`}
      >
        <form
          data-effects-reduced={reduced}
          className={styles.form}
          onSubmit={(event) => void send(event)}
        >
          <div className={styles.switcher} role="group" aria-label="عرض الهدايا">
            <button type="button" aria-pressed={view === 'send'} onClick={() => setView('send')}>
              <Gift size={17} /> إرسال هدية
            </button>
            <button
              type="button"
              aria-pressed={view === 'ranking'}
              onClick={() => setView('ranking')}
            >
              <Trophy size={17} /> الترتيب
            </button>
          </div>
          {view === 'send' && (
            <>
              <div className={styles.preview} aria-label="معاينة الهدية">
                <span className={styles.previewArt} data-gift={selected.id} aria-hidden="true">
                  <EffectArt key={selected.id} kind={selected.id} large />
                </span>
                <div>
                  <span className={styles.eyebrow}>
                    <Sparkles size={14} /> معاينة الهدية
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
                          setError('');
                        }}
                      />
                      <span data-gift={gift.id} aria-hidden="true">
                        <EffectArt kind={gift.id} />
                      </span>
                      <strong>{gift.name}</strong>
                      <small>مجانية</small>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className={styles.hint}>
                تظهر الهدية لأعضاء الغرفة بالتتابع، مع تجميع التكرار. يمكنك الإرسال مرة كل خمس
                ثوانٍ.
              </p>
              {!enabled && <p role="status">الهدايا متاحة للأعضاء أثناء فتح الدردشة فقط.</p>}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <button
                className="v-button"
                type="submit"
                disabled={sending || !enabled || !recipient}
              >
                <Gift size={18} />
                {sending ? 'جارٍ الإرسال…' : `إرسال ${selected.name} مجانًا`}
              </button>
            </>
          )}
          {view === 'ranking' && (
            <section className={styles.ranking} aria-label="ترتيب الهدايا التجريبية">
              <div className={styles.rankingHeader}>
                <span className={styles.trophy}>
                  <Trophy size={24} aria-hidden="true" />
                </span>
                <div>
                  <span className={styles.rankingEyebrow}>لحظات تستحق الاحتفاء</span>
                  <h3>ترتيب الغرفة</h3>
                </div>
              </div>
              <p>
                حسب الهدايا الظاهرة في سجل الغرفة الحالي. قد يتغير الترتيب عند حذف الرسائل أو
                إخفائها أو امتلاء السجل.
              </p>
              {ranking.guests.length ? (
                <div className={styles.rankingColumns}>
                  <div>
                    <h4>القستات الأكثر استقبالًا</h4>
                    <ol>
                      {ranking.guests.slice(0, 5).map((guest, index) => (
                        <li key={guest.id}>
                          <span className={styles.rankNumber}>{index + 1}</span>
                          <bdi>{guest.name}</bdi>
                          <span className={styles.rankCount}>{guest.count} هدية</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h4>الهدايا الأكثر إرسالًا</h4>
                    <ol>
                      {ranking.gifts.slice(0, 5).map((gift, index) => (
                        <li key={gift.id}>
                          <span className={styles.rankNumber}>{index + 1}</span>
                          <span>{gift.name}</span>
                          <span className={styles.rankCount}>{gift.count}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyRanking}>
                  <Gift size={24} aria-hidden="true" />
                  <strong>ابدأ اللحظة الأولى</strong>
                  <span>عند إرسال هدية ستظهر هنا ضمن سجل الغرفة.</span>
                  <button type="button" onClick={() => setView('send')}>
                    اختر هدية
                  </button>
                </div>
              )}
            </section>
          )}
        </form>
      </Dialog>
    </MotionConfig>
  );
}

export function GiftReceipt({ message }: { message: VoiceMessage }) {
  const gift = message.gift && voiceGift(message.gift.id);
  if (!gift || !message.gift) return <p>{message.text}</p>;
  return (
    <div className={styles.receipt}>
      <span className={styles.giftEmoji} data-gift={gift.id} aria-hidden="true">
        <EffectArt kind={gift.id} />
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
