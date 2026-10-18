'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Flag, MessageCircle, Pin, Reply, Send, SmilePlus, Trash2, X } from 'lucide-react';
import type { VoiceEvent, VoiceMessage, VoiceParticipant } from '@/lib/voice/types';
import { Avatar } from './voice-ui';
import { useVoiceMediaQuery } from './use-voice-overlay';
import { number } from './voice-client';
import roomStyles from './room-layout.module.css';

export function VoiceChat({
  messages,
  me,
  enabled,
  canModerate,
  onEvent,
  onProfile,
  onError,
  close,
}: {
  messages: VoiceMessage[];
  me: VoiceParticipant | null;
  enabled: boolean;
  canModerate: boolean;
  onEvent: (event: VoiceEvent) => Promise<void>;
  onProfile: (id: string) => void;
  onError: (message: string) => void;
  close: () => void;
}) {
  const [text, setText] = useState('');
  const draggable = useVoiceMediaQuery('(max-width: 760px)');
  const [reply, setReply] = useState<VoiceMessage | null>(null);
  const [sending, setSending] = useState(false);
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
  async function act(event: VoiceEvent) {
    try {
      await onEvent(event);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء.');
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onEvent({
        type: 'message',
        text: text.trim(),
        ...(reply ? { replyTo: reply.id } : {}),
      });
      setText('');
      setReply(null);
      nearBottom.current = true;
    } catch (err) {
      onError(err instanceof Error ? err.message : 'تعذر إرسال الرسالة.');
    } finally {
      setSending(false);
    }
  }
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
          <article
            className={`v-message ${message.userId === me?.id ? 'v-my-message' : ''}`}
            key={message.id}
          >
            <button
              className="v-avatar-button"
              onClick={() => onProfile(message.userId)}
              aria-label={`ملف ${message.name}`}
            >
              <Avatar user={message} size={32} />
            </button>
            <div className="v-message-body">
              <div className="v-message-meta">
                <strong>
                  <bdi>{message.name}</bdi>
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
                  {messages.find((m) => m.id === message.replyTo)?.text || 'رد على رسالة سابقة'}
                </blockquote>
              )}
              <p>{message.text}</p>
              {Object.entries(message.reactions).length > 0 && (
                <div className="v-reactions">
                  {Object.entries(message.reactions).map(([emoji, users]) => (
                    <button
                      key={emoji}
                      aria-label={`تفاعل ${emoji}، ${users.length}`}
                      aria-pressed={Boolean(me && users.includes(me.id))}
                      onClick={() => void act({ type: 'reaction', messageId: message.id, emoji })}
                    >
                      {emoji} {users.length}
                    </button>
                  ))}
                </div>
              )}
              <div className="v-message-actions">
                <button aria-label={`الرد على ${message.name}`} onClick={() => setReply(message)}>
                  <Reply size={14} />
                </button>
                <button
                  aria-label="إعجاب بالرسالة"
                  onClick={() => void act({ type: 'reaction', messageId: message.id, emoji: '👍' })}
                >
                  <SmilePlus size={14} />
                </button>
                {canModerate && (
                  <button
                    aria-label={message.pinned ? 'إلغاء تثبيت الرسالة' : 'تثبيت الرسالة'}
                    onClick={() =>
                      void act({
                        type: 'pin-message',
                        messageId: message.id,
                        pinned: !message.pinned,
                      })
                    }
                  >
                    <Pin size={14} />
                  </button>
                )}
                {(canModerate || message.userId === me?.id) && (
                  <button
                    aria-label="حذف الرسالة"
                    onClick={() => void act({ type: 'delete-message', messageId: message.id })}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button aria-label="الإبلاغ عن الرسالة" onClick={() => setReport(message.id)}>
                  <Flag size={14} />
                </button>
              </div>
            </div>
          </article>
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
      {reply && (
        <div className="v-reply-preview">
          <Reply size={14} />
          <span>
            ردًا على {reply.name}: {reply.text}
          </span>
          <button className="v-icon" aria-label="إلغاء الرد" onClick={() => setReply(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      <form className="v-chat-compose" onSubmit={send}>
        <label className="v-sr-only" htmlFor="voice-message">
          رسالتك
        </label>
        <input
          id="voice-message"
          value={text}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          disabled={!enabled || !me}
          placeholder={enabled ? 'اكتب رسالتك هنا…' : 'الدردشة معطّلة من المضيف'}
          autoComplete="off"
        />
        <button
          className="v-icon"
          type="button"
          aria-label="إضافة رمز تعبيري"
          disabled={!enabled}
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
      </form>
    </section>
  );
}
