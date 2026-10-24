'use client';

import {
  lazy,
  Suspense,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { motion } from 'framer-motion';
import { useChatDrag } from './use-chat-drag';
import { Flag, Gift, MessageCircle, Pin, Reply, Send, SmilePlus, Trash2, X } from 'lucide-react';
import type { VoiceEvent, VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import { Avatar } from './voice-ui';
import { useVoiceMediaQuery } from './use-voice-overlay';
import { number } from './voice-client';
import roomStyles from './room-layout.module.css';
import { MemberName } from './member-name';
import { GiftReceipt } from './voice-gifts';
import { EmojiContent } from './emoji-content';
import { messageEmojiCount, MAX_MESSAGE_EMOJIS } from '@/lib/voice/emojis';
import emojiStyles from './emoji.module.css';
const EmojiPicker = lazy(() => import('./emoji-picker'));

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
  open = true,
  onDismissReady,
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
  open?: boolean;
  onDismissReady?: (dismiss: (() => void) | null) => void;
}) {
  const draggable = useVoiceMediaQuery('(max-width: 760px)');
  const overlay = useVoiceMediaQuery('(max-width: 1020px)');
  const [reply, setReply] = useState<VoiceMessage | null>(null);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [report, setReport] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const { y, dismiss, ...dragHandle } = useChatDrag(panel, overlay, open, close);
  useEffect(() => {
    onDismissReady?.(dismiss);
    return () => onDismissReady?.(null);
  }, [dismiss, onDismissReady]);
  const previous = useRef(new Set<string>());
  const nearBottom = useRef(true);
  useEffect(() => {
    // History stays capped at 200; new arrivals can replace old IDs without growing it.
    const delta = messages.filter((message) => !previous.current.has(message.id)).length;
    if (nearBottom.current) {
      if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    } else if (delta) setNewCount((count) => count + delta);
    previous.current = new Set(messages.map((message) => message.id));
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
    <motion.section
      ref={panel}
      style={{ y }}
      className={`v-chat ${roomStyles.chat}`}
      aria-label="دردشة الغرفة"
    >
      {draggable && (
        <button
          className="v-chat-drag"
          aria-label="اسحب لأسفل أو اضغط لإغلاق الدردشة"
          {...dragHandle}
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
        <button className="v-icon v-chat-close" onClick={dismiss} aria-label="إغلاق الدردشة">
          <X size={19} />
        </button>
      </header>
      {pinned && (
        <div className="v-pinned">
          <Pin size={15} />
          <span>
            <strong>{pinned.name}</strong>
            <EmojiContent text={pinned.text} />
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
            onChooseReaction={setReactionTarget}
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
            void onEvent({
              type: 'report',
              messageId: report,
              reason: reportReason,
            })
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
      {reactionTarget && me && enabled && (
        <div className={emojiStyles.reactionAnchor}>
          <Suspense fallback={<p role="status">تحميل لوحة الفيسات…</p>}>
            <EmojiPicker
              key={me.id}
              userId={me.id}
              close={() => setReactionTarget(null)}
              onSelect={(emoji) => {
                void act({
                  type: 'reaction',
                  messageId: reactionTarget,
                  emoji,
                  requestId: crypto.randomUUID(),
                });
                setReactionTarget(null);
              }}
            />
          </Suspense>
        </div>
      )}
      <VoiceChatComposer
        reply={reply}
        me={me}
        enabled={enabled}
        onEvent={onEvent}
        onError={onError}
        onGift={onGift}
        onCancelReply={() => setReply(null)}
        onSent={(sentReplyId, unchanged) => {
          if (unchanged) setReply((current) => (current?.id === sentReplyId ? null : current));
          nearBottom.current = true;
        }}
      />
    </motion.section>
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
  onChooseReaction: (id: string) => void;
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
    onChooseReaction,
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
          {message.replyTo && (
            <blockquote>
              <EmojiContent text={replyText || 'رد على رسالة سابقة'} />
            </blockquote>
          )}
          {message.gift ? (
            <GiftReceipt message={message} />
          ) : (
            <p>
              <EmojiContent text={message.text} />
            </p>
          )}
          {Object.entries(message.reactions).length > 0 && (
            <div className="v-reactions">
              {Object.entries(message.reactions).map(([emoji, users]) => (
                <button
                  key={emoji}
                  aria-label={`تفاعل ${emoji}، ${users.length}`}
                  aria-pressed={Boolean(selfId && users.includes(selfId))}
                  onClick={() =>
                    void onAct({
                      type: 'reaction',
                      messageId: message.id,
                      emoji,
                      requestId: crypto.randomUUID(),
                    })
                  }
                >
                  <EmojiContent text={emoji} /> {users.length}
                </button>
              ))}
            </div>
          )}
          <div className="v-message-actions">
            <button aria-label={`الرد على ${message.name}`} onClick={() => onReply(message)}>
              <Reply size={14} />
            </button>
            <button aria-label="اختيار تفاعل للرسالة" onClick={() => onChooseReaction(message.id)}>
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
      previous.onChooseReaction === next.onChooseReaction &&
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
  onSent: (replyId: string | undefined, unchanged: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [picker, setPicker] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const draftVersion = useRef(0);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const busy = useRef(false);
  const replyingTo = reply?.id;
  const canCompose = enabled && Boolean(me);
  useEffect(() => {
    if (replyingTo && canCompose) input.current?.focus();
  }, [replyingTo, canCompose]);
  function insertEmoji(value: string) {
    const field = input.current;
    const start = field?.selectionStart ?? text.length;
    const end = field?.selectionEnd ?? start;
    const next = text.slice(0, start) + value + text.slice(end);
    if (next.length > 1000 || messageEmojiCount(next) > MAX_MESSAGE_EMOJIS) {
      onError('الحد الأقصى 12 فيسًا و1000 حرف للرسالة.');
      return;
    }
    draftVersion.current++;
    setText(next);
    setPicker(false);
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + value.length, start + value.length);
    });
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || busy.current || !enabled || !me) return;
    if (messageEmojiCount(text) > MAX_MESSAGE_EMOJIS) {
      onError('الحد الأقصى 12 فيسًا للرسالة.');
      return;
    }
    const fingerprint = JSON.stringify([text.trim(), reply?.id]);
    const submittedVersion = draftVersion.current;
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, requestId: crypto.randomUUID() };
    busy.current = true;
    setSending(true);
    input.current?.focus({ preventScroll: true });
    try {
      await onEvent({
        type: 'message',
        text: text.trim(),
        requestId: pending.current.requestId,
        ...(reply ? { replyTo: reply.id } : {}),
      });
      // An acknowledgement must not erase edits made while the request was in flight.
      const unchanged = draftVersion.current === submittedVersion;
      if (unchanged) setText('');
      pending.current = null;
      onSent(reply?.id, unchanged);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
      busy.current = false;
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
      <form className={`v-chat-compose ${emojiStyles.anchor}`} onSubmit={send} aria-busy={sending}>
        {sending && (
          <span className="v-sr-only" role="status">
            جارٍ إرسال الرسالة…
          </span>
        )}
        {picker && me && enabled && (
          <Suspense fallback={<p role="status">تحميل لوحة الفيسات…</p>}>
            <EmojiPicker
              key={me.id}
              userId={me.id}
              onSelect={insertEmoji}
              close={() => setPicker(false)}
            />
          </Suspense>
        )}
        <label className="v-sr-only" htmlFor="voice-message">
          رسالتك
        </label>
        <textarea
          ref={input}
          rows={1}
          id="voice-message"
          value={text}
          maxLength={1000}
          onChange={(e) => {
            draftVersion.current++;
            setText(e.target.value);
          }}
          disabled={!enabled || !me}
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
            disabled={!enabled || !me}
            aria-expanded={picker}
            aria-haspopup="dialog"
            onClick={() => setPicker((value) => !value)}
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
