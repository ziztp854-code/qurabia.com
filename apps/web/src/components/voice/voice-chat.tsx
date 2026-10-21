'use client';

import { memo, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Flag, Gift, MessageCircle, Pin, Reply, Send, SmilePlus, Trash2, X } from 'lucide-react';
import type { VoiceEvent, VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import { Avatar } from './voice-ui';
import { useVoiceMediaQuery } from './use-voice-overlay';
import { number } from './voice-client';
import roomStyles from './room-layout.module.css';
import { MemberName } from './member-name';
import { GiftReceipt } from './voice-gifts';

export const VoiceChat = memo(function VoiceChat({
  messages,
  participants = [],
  me,
  enabled,
  canModerate,
  onEvent,
  onProfile,
  onError,
  close,
  onGift,
}: {
  messages: VoiceMessage[];
  participants?: VoiceParticipant[];
  me: VoiceParticipant | null;
  enabled: boolean;
  canModerate: boolean;
  onEvent: (event: VoiceEvent) => Promise<void>;
  onProfile: (id: string) => void;
  onError: (message: string) => void;
  close: () => void;
  onGift?: () => void;
}) {
  const draggable = useVoiceMediaQuery('(max-width: 760px)');
  const [reply, setReply] = useState<VoiceMessage | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [report, setReport] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dragStart = useRef<number | null>(null);
  function resetDrag() {
    dragStart.current = null;
    if (panel.current) panel.current.style.transform = '';
  }
  const previous = useRef(0);
  const nearBottom = useRef(true);
  useEffect(() => {
    const delta = Math.max(0, messages.length - previous.current);
    if (nearBottom.current) {
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    } else if (delta) setNewCount((count) => count + delta);
    previous.current = messages.length;
  }, [messages]);
  const act = useCallback(
    async (event: VoiceEvent) => {
      try {
        await onEvent(event);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء.');
      }
    },
    [onEvent, onError],
  );
  const membersById = new Map<string, ChatAuthor>(
    participants.map((member) => [
      member.id,
      {
        name: member.name,
        image: member.image,
        accountBadges: member.accountBadges,
        communityIdentity: member.communityIdentity,
      },
    ]),
  );
  const messagesById = new Map(messages.map((message) => [message.id, message]));
  const pinned = messages.find((m) => m.pinned);
  return (
    <section ref={panel} className={`v-chat ${roomStyles.chat}`} aria-label="دردشة الغرفة">
      {draggable && (
        <button
          className="v-chat-drag"
          aria-label="اسحب لأسفل أو اضغط لإغلاق الدردشة"
          onClick={close}
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
            e.currentTarget.setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart.current === null) return;
            const distance = Math.max(0, e.clientY - dragStart.current);
            if (panel.current)
              panel.current.style.transform = `translateY(${Math.min(distance, 250)}px)`;
          }}
          onPointerUp={(e) => {
            const distance = dragStart.current === null ? 0 : e.clientY - dragStart.current;
            resetDrag();
            if (distance > 80) close();
          }}
          onPointerCancel={resetDrag}
        >
          <span />
        </button>
      )}
      <header>
        <h2>
          <MessageCircle size={18} />
          الدردشة
        </h2>
        <span>{number(messages.length)} رسالة</span>
        <button className="v-icon v-chat-close" onClick={close} aria-label="إغلاق الدردشة">
          <X size={19} />
        </button>
      </header>
      {pinned && (
        <div className="v-pinned">
          <Pin size={15} />
          <span>
            <strong>{pinned.name}</strong>
            {pinned.text}
          </span>
        </div>
      )}
      <div
        className="v-messages"
        ref={scroll}
        role="log"
        aria-label="رسائل الغرفة"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={() => {
          if (scroll.current) {
            nearBottom.current =
              scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight <
              90;
            if (nearBottom.current) setNewCount(0);
          }
        }}
      >
        {!messages.length && (
          <div className="v-chat-empty">
            <MessageCircle size={27} />
            <p>قولوا هلا.. وابدؤوا السالفة</p>
            <small>الدردشة مساحة ودية تحترم الجميع.</small>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessageRow
            key={message.id}
            message={message}
            author={membersById.get(message.userId)}
            replyText={message.replyTo ? messagesById.get(message.replyTo)?.text : undefined}
            selfId={me?.id}
            canModerate={canModerate}
            onAct={act}
            onProfile={onProfile}
            onReply={setReply}
            onReport={setReport}
          />
        ))}
      </div>
      {newCount > 0 && (
        <button
          className="v-new-messages"
          onClick={() => {
            if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
            setNewCount(0);
            nearBottom.current = true;
          }}
        >
          {newCount} رسائل جديدة ↓
        </button>
      )}
      {report && (
        <form
          className="v-chat-report"
          onSubmit={(e) => {
            e.preventDefault();
            setReportBusy(true);
            void onEvent({ type: 'report', messageId: report, reason: reportReason })
              .then(() => {
                setReport(null);
                setReportReason('');
              })
              .catch((err) => onError(err instanceof Error ? err.message : 'تعذر إرسال البلاغ.'))
              .finally(() => setReportBusy(false));
          }}
        >
          <label>
            سبب الإبلاغ
            <input
              required
              minLength={5}
              maxLength={500}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            />
          </label>
          <button className="v-button v-small" disabled={reportBusy}>
            إرسال البلاغ
          </button>
          <button
            type="button"
            className="v-icon"
            onClick={() => setReport(null)}
            aria-label="إلغاء البلاغ"
          >
            <X size={16} />
          </button>
        </form>
      )}
      <VoiceChatComposer
        reply={reply}
        me={me}
        enabled={enabled}
        onEvent={onEvent}
        onError={onError}
        onGift={onGift}
        onCancelReply={() => setReply(null)}
        onSent={() => {
          setReply(null);
          nearBottom.current = true;
        }}
      />
    </section>
  );
});

type ChatAuthor = Pick<VoiceParticipant, 'name' | 'image' | 'accountBadges' | 'communityIdentity'>;
type ChatMessageRowProps = {
  message: VoiceMessage;
  author: ChatAuthor | undefined;
  replyText: string | undefined;
  selfId: string | undefined;
  canModerate: boolean;
  onAct: (event: VoiceEvent) => Promise<void>;
  onProfile: (id: string) => void;
  onReply: (message: VoiceMessage) => void;
  onReport: (id: string) => void;
};

const ChatMessageRow = memo(
  function ChatMessageRow({
    message,
    author,
    replyText,
    selfId,
    canModerate,
    onAct,
    onProfile,
    onReply,
    onReport,
  }: ChatMessageRowProps) {
    return (
      <article className={`v-message ${message.userId === selfId ? 'v-my-message' : ''}`}>
        <button
          className="v-avatar-button"
          onClick={() => onProfile(message.userId)}
          aria-label={`ملف ${message.name}`}
        >
          <Avatar user={author || message} size={32} />
        </button>
        <div className="v-message-body">
          <div className="v-message-meta">
            <strong>
              <MemberName
                name={message.name}
                badges={author?.accountBadges}
                identity={author?.communityIdentity}
              />
            </strong>
            <time dateTime={new Date(message.createdAt).toISOString()}>
              {new Date(message.createdAt).toLocaleTimeString('ar-SA', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
            {message.pinned && <Pin size={12} />}
          </div>
          {message.replyTo && <blockquote>{replyText || 'رد على رسالة سابقة'}</blockquote>}
          {message.gift ? <GiftReceipt message={message} /> : <p>{message.text}</p>}
          {Object.entries(message.reactions).length > 0 && (
            <div className="v-reactions">
              {Object.entries(message.reactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  aria-label={`تفاعل ${emoji}، ${users.length}`}
                  aria-pressed={Boolean(selfId && users.includes(selfId))}
                  onClick={() => void onAct({ type: 'reaction', messageId: message.id, emoji })}
                >
                  {emoji} {users.length}
                </button>
              ))}
            </div>
          )}
          <div className="v-message-actions">
            <button aria-label={`الرد على ${message.name}`} onClick={() => onReply(message)}>
              <Reply size={14} />
            </button>
            <button
              aria-label="إعجاب بالرسالة"
              onClick={() => void onAct({ type: 'reaction', messageId: message.id, emoji: '👍' })}
            >
              <SmilePlus size={14} />
            </button>
            {canModerate && (
              <button
                aria-label={message.pinned ? 'إلغاء تثبيت الرسالة' : 'تثبيت الرسالة'}
                onClick={() =>
                  void onAct({
                    type: 'pin-message',
                    messageId: message.id,
                    pinned: !message.pinned,
                  })
                }
              >
                <Pin size={14} />
              </button>
            )}
            {(canModerate || message.userId === selfId) && (
              <button
                aria-label="حذف الرسالة"
                onClick={() => void onAct({ type: 'delete-message', messageId: message.id })}
              >
                <Trash2 size={14} />
              </button>
            )}
            <button aria-label="الإبلاغ عن الرسالة" onClick={() => onReport(message.id)}>
              <Flag size={14} />
            </button>
          </div>
        </div>
      </article>
    );
  },
  (previous, next) => {
    // Heartbeats recreate JSON objects. Compare the full message and the complete
    // author display value so unchanged history skips expensive badges and dates.
    return (
      previous.selfId === next.selfId &&
      previous.canModerate === next.canModerate &&
      previous.replyText === next.replyText &&
      previous.onAct === next.onAct &&
      previous.onProfile === next.onProfile &&
      previous.onReply === next.onReply &&
      previous.onReport === next.onReport &&
      (previous.message === next.message ||
        JSON.stringify(previous.message) === JSON.stringify(next.message)) &&
      (previous.author === next.author ||
        JSON.stringify(previous.author) === JSON.stringify(next.author))
    );
  },
);

// Draft changes stay below the message history, so each keystroke only renders the composer.
function VoiceChatComposer({
  reply,
  me,
  enabled,
  onEvent,
  onError,
  onGift,
  onCancelReply,
  onSent,
}: {
  reply: VoiceMessage | null;
  me: VoiceParticipant | null;
  enabled: boolean;
  onEvent: (event: VoiceEvent) => Promise<void>;
  onError: (message: string) => void;
  onGift?: () => void;
  onCancelReply: () => void;
  onSent: () => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending || !enabled || !me) return;
    setSending(true);
    try {
      await onEvent({
        type: 'message',
        text: text.trim(),
        ...(reply ? { replyTo: reply.id } : {}),
      });
      setText('');
      onSent();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      {reply && (
        <div className="v-reply-preview">
          <Reply size={14} />
          <span>
            ردًا على {reply.name}: {reply.text}
          </span>
          <button className="v-icon" aria-label="إلغاء الرد" onClick={onCancelReply}>
            <X size={15} />
          </button>
        </div>
      )}
      <form className="v-chat-compose" onSubmit={send}>
        <label className="v-sr-only" htmlFor="voice-message">
          رسالتك
        </label>
        <textarea
          rows={2}
          id="voice-message"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          disabled={!enabled || !me || sending}
          placeholder={enabled ? 'اكتب رسالتك هنا…' : 'الدردشة معطّلة من المضيف'}
          autoComplete="off"
        />
        <div className={roomStyles.composeTools}>
          <span className={roomStyles.composeHint}>مساحة للسوالف واللحظات الحلوة</span>
          {onGift && (
            <button
              className={`v-icon ${roomStyles.giftAction}`}
              type="button"
              aria-label="إرسال هدية"
              disabled={!enabled || !me}
              onClick={onGift}
            >
              <Gift size={20} />
            </button>
          )}
          <button
            className="v-icon"
            type="button"
            aria-label="إضافة رمز تعبيري"
            disabled={!enabled || !me || sending}
            onClick={() => setText((t) => `${t} ✨`)}
          >
            <SmilePlus size={19} />
          </button>
          <button
            className="v-send"
            type="submit"
            aria-label="إرسال الرسالة"
            disabled={!enabled || !me || !text.trim() || sending}
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </>
  );
}
