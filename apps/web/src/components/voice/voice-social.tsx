'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCheck,
  MessageCircle,
  Send,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { Dialog } from '@/components/ui/overlay';
import type { VoiceIdentity, VoicePreferences, VoicePreferencesAction } from '@/lib/voice/types';
import { voiceRequest } from './voice-client';
import { Avatar } from './voice-ui';
import styles from './voice-social.module.css';

type Relationship = {
  following: boolean;
  followsYou: boolean;
  friend: boolean;
  canMessage: boolean;
};
type Contact = { peer: VoiceIdentity; relationship: Relationship };
type Conversation = Contact & {
  messages: {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
    readAt: string | null;
  }[];
};
export function VoiceSocial({
  user,
  preferences,
  onPreference,
  peerId,
  onPeerChange,
  onVisibilityChange,
}: {
  user: VoiceIdentity;
  preferences: VoicePreferences;
  onPreference: (action: VoicePreferencesAction) => Promise<void>;
  peerId?: string | null;
  onPeerChange?: (id: string | null) => void;
  onVisibilityChange?: (open: boolean) => void;
}) {
  const [localOpen, setOpen] = useState(false);
  const open = localOpen || Boolean(peerId);
  const [localSelected, setSelected] = useState<string | null>(null);
  const selected = peerId ?? localSelected;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversationData, setConversation] = useState<Conversation | null>(null);
  const conversation = conversationData?.peer.id === selected ? conversationData : null;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [following, setFollowing] = useState(false);
  const [draft, setDraft] = useState({ peerId: selected, text: '' });
  const text = draft.peerId === selected ? draft.text : '';
  const setText = (value: string) => setDraft({ peerId: selected, text: value });
  const scroll = useRef<HTMLDivElement>(null);
  const requestVersion = useRef(0);
  const sendingRef = useRef(false);
  const responseSequence = useRef(0);
  const changeOpen = useCallback(
    (value: boolean) => {
      setOpen(value);
      onVisibilityChange?.(value);
      if (!value) {
        setSelected(null);
        onPeerChange?.(null);
      }
    },
    [onPeerChange, onVisibilityChange],
  );
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const version = ++requestVersion.current;
    async function load(initial = false) {
      if (sendingRef.current) return;
      const sequence = ++responseSequence.current;
      try {
        if (selected) {
          const data = await voiceRequest<Conversation>(`social/${encodeURIComponent(selected)}`);
          if (
            !cancelled &&
            version === requestVersion.current &&
            sequence === responseSequence.current
          ) {
            setConversation(data);
            setError('');
          }
        } else {
          const data = await voiceRequest<{ contacts: Contact[] }>('social');
          if (!cancelled) setContacts(data.contacts);
        }
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : 'تعذر تحميل المحادثة.');
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    }
    void load(true);
    const timer = selected
      ? setInterval(() => {
          if (!document.hidden) void load();
        }, 2500)
      : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [open, selected, preferences.following, preferences.blockedUsers]);
  const lastMessage = conversation?.messages.at(-1)?.id;
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [lastMessage]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !text.trim() || sending || !conversation?.relationship.canMessage) return;
    const version = requestVersion.current;
    setSending(true);
    sendingRef.current = true;
    responseSequence.current++;
    setError('');
    try {
      const data = await voiceRequest<Conversation>(`social/${encodeURIComponent(selected)}`, {
        text: text.trim(),
      });
      if (version === requestVersion.current) {
        setConversation(data);
        setText('');
      }
    } catch (error) {
      if (version === requestVersion.current)
        setError(error instanceof Error ? error.message : 'تعذر الإرسال.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  return (
    <>
      <button
        className={`v-button v-outline ${styles.launcher}`}
        onClick={() => {
          setLoading(true);
          setError('');
          changeOpen(true);
        }}
        aria-label="الأصدقاء والرسائل الخاصة"
      >
        <MessageCircle size={18} />
        <span>الرسائل</span>
      </button>
      <Dialog
        open={open}
        onOpenChange={changeOpen}
        title={selected ? conversation?.peer.name || 'محادثة خاصة' : 'أصدقاؤك ورسائلك'}
        className={`v-dialog ${styles.dialog}`}
      >
        <div className={styles.content} dir="rtl">
          {selected ? (
            <>
              <button
                className={styles.back}
                onClick={() => {
                  setLoading(true);
                  setError('');
                  setSelected(null);
                  onPeerChange?.(null);
                }}
              >
                <ArrowRight size={18} /> كل المحادثات
              </button>
              {conversation && (
                <>
                  <div className={styles.person}>
                    <Avatar user={conversation.peer} size={44} />
                    <div>
                      <strong>
                        <bdi>{conversation.peer.name}</bdi>
                      </strong>
                      <small>
                        {conversation.relationship.friend
                          ? 'صديق · تتابعان بعضكما'
                          : conversation.relationship.followsYou
                            ? 'يتابعك'
                            : 'عضو تحدي لايف'}
                      </small>
                    </div>
                    <button
                      className="v-button v-outline"
                      disabled={following}
                      aria-pressed={conversation.relationship.following}
                      onClick={async () => {
                        setFollowing(true);
                        try {
                          await onPreference({
                            type: 'follow',
                            id: conversation.peer.id,
                            enabled: !conversation.relationship.following,
                          });
                        } finally {
                          setFollowing(false);
                        }
                      }}
                    >
                      {conversation.relationship.following ? (
                        <UserCheck size={17} />
                      ) : (
                        <UserPlus size={17} />
                      )}
                      {conversation.relationship.following ? 'متابَع' : 'متابعة'}
                    </button>
                  </div>
                  <p className={styles.hint}>هذه الرسائل تظهر لك وللعضو الآخر فقط.</p>
                  <div className={styles.messages} ref={scroll} aria-label="المحادثة الخاصة">
                    {!conversation.messages.length && (
                      <div className={styles.empty}>
                        <MessageCircle size={32} />
                        <p>ابدأ حديثًا لطيفًا</p>
                      </div>
                    )}
                    {conversation.messages.map((message) => (
                      <article
                        key={message.id}
                        data-self={message.senderId === user.id}
                        className={styles.message}
                      >
                        <p dir="auto">{message.text}</p>
                        <small>
                          <time dateTime={message.createdAt}>
                            {new Date(message.createdAt).toLocaleTimeString('ar-SA', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          {message.senderId === user.id && message.readAt && (
                            <CheckCheck size={14} aria-label="مقروءة" />
                          )}
                        </small>
                      </article>
                    ))}
                  </div>
                  {!conversation.relationship.canMessage && (
                    <p className={styles.hint}>
                      الإرسال غير متاح حسب خصوصية العضو. عند السماح للأصدقاء، يلزم أن تتابعا بعضكما.
                    </p>
                  )}
                  <form onSubmit={(event) => void send(event)} className={styles.composer}>
                    <label className={styles.inputLabel}>
                      رسالتك
                      <input
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        maxLength={1000}
                        disabled={!conversation.relationship.canMessage || sending}
                        placeholder="اكتب رسالة خاصة…"
                        autoComplete="off"
                      />
                    </label>
                    <button
                      className="v-button"
                      type="submit"
                      disabled={!text.trim() || sending || !conversation.relationship.canMessage}
                      aria-label="إرسال رسالة خاصة"
                    >
                      <Send size={19} />
                      {sending && 'جارٍ الإرسال'}
                    </button>
                  </form>
                </>
              )}
            </>
          ) : (
            <>
              <label className={styles.privacy}>
                من يستطيع إرسال رسالة لك؟
                <select
                  value={preferences.directMessages ?? 'friends'}
                  onChange={(event) =>
                    void onPreference({
                      type: 'privacy',
                      directMessages: event.target.value as 'friends' | 'everyone' | 'none',
                    })
                  }
                >
                  <option value="friends">الأصدقاء — متابعة متبادلة</option>
                  <option value="everyone">جميع الأعضاء</option>
                  <option value="none">لا أحد</option>
                </select>
              </label>
              <p className={styles.hint}>
                المتابعة المتبادلة تجعل العضو صديقًا. الحظر يمنع التواصل في الاتجاهين.
              </p>
              <div className={styles.contacts}>
                {!loading && !contacts.length && (
                  <div className={styles.empty}>
                    <Users size={32} />
                    <p>ابدأ بمتابعة أعضاء من الغرف</p>
                    <small>ستجد هنا من تتابعهم ومن يتابعونك ومحادثاتك الأخيرة.</small>
                  </div>
                )}
                {contacts.map((contact) => (
                  <button
                    className={styles.contact}
                    key={contact.peer.id}
                    onClick={() => {
                      setLoading(true);
                      setError('');
                      setSelected(contact.peer.id);
                    }}
                  >
                    <Avatar user={contact.peer} size={44} />
                    <span>
                      <strong>
                        <bdi>{contact.peer.name}</bdi>
                      </strong>
                      <small>
                        {contact.relationship.friend
                          ? 'صديق'
                          : contact.relationship.following
                            ? 'تتابعه'
                            : contact.relationship.followsYou
                              ? 'يتابعك'
                              : 'محادثة سابقة'}
                      </small>
                    </span>
                    {contact.relationship.friend ? (
                      <UserCheck size={20} />
                    ) : (
                      <MessageCircle size={20} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          {loading && <p role="status">جارٍ التحميل…</p>}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
