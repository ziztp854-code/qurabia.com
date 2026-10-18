'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import {
  ArrowRight,
  AudioLines,
  Check,
  Crown,
  Flag,
  Hand,
  Headphones,
  Heart,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MoreHorizontal,
  Search,
  Share2,
  ShieldCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Dialog } from '@/components/ui/overlay';
import { Input } from '@/components/ui/forms';
import type {
  VoiceEvent,
  VoiceIdentity,
  VoicePreferences,
  VoicePreferencesAction,
  VoiceSnapshot,
} from '@/lib/voice/types';
import { AudioSession } from './audio-session';
import { PersistentVoiceDock } from './persistent-voice-dock';
import { Avatar, EmptyState, LiveBadge, VoiceShell, VoiceCover } from './voice-ui';
import {
  captureInvite,
  clearSavedInvite,
  emptyPreferences,
  nextSnapshot,
  number,
  requestedSeat,
  roleLabels,
  VoiceRequestError,
  voiceRequest,
} from './voice-client';
import { VoiceChat } from './voice-chat';
import { RoomSettings } from './room-settings';
import { useVoiceMediaQuery, useVoiceOverlay } from './use-voice-overlay';

export type VoiceRoomHandle = { leave: () => Promise<void> };

export function VoiceRoomView({
  roomId,
  user,
  visible = true,
  onLeave,
  ref,
}: {
  roomId: string;
  user: VoiceIdentity;
  visible?: boolean;
  onLeave?: () => void;
  ref?: Ref<VoiceRoomHandle>;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<VoiceSnapshot | null>(null);
  const [preferences, setPreferences] = useState<VoicePreferences>(emptyPreferences);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinRequired, setJoinRequired] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const onProfileOpenChange = useCallback((open: boolean) => {
    if (!open) setProfileId(null);
  }, []);
  const [chatOpen, setChatOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const compactChat = useVoiceMediaQuery('(max-width: 1020px)');
  const closeChat = useCallback(() => setChatOpen(false), []);
  const [deafened, setDeafened] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [audioState, setAudioState] = useState('disconnected');
  const [settings, setSettings] = useState(false);
  const [closeRoom, setCloseRoom] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [mediaPending, setMediaPending] = useState(false);
  const inviteRef = useRef<string | null>(null);
  const inviteRoomRef = useRef(roomId);
  const mountSequence = useRef(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportUserId, setReportUserId] = useState<string | null>(null);
  const chatOverlayOpen = chatOpen && compactChat && !profileId && !reportOpen;
  useVoiceOverlay(chatOverlayOpen && visible, chatRef, closeChat);
  const leaving = useRef(false);
  const snapshotRef = useRef<VoiceSnapshot | null>(null);
  const apply = useCallback((data: VoiceSnapshot) => {
    if (leaving.current) return;
    const next = nextSnapshot(snapshotRef.current, data);
    if (next === snapshotRef.current) return;
    snapshotRef.current = next;
    setSnapshot(next);
    if (data.mediaSyncPending !== undefined) setMediaPending(data.mediaSyncPending);
  }, []);
  const event = useCallback(
    async (value: VoiceEvent) => {
      const result = await voiceRequest<VoiceSnapshot>(`rooms/${roomId}/events`, value);
      apply(result);
    },
    [roomId, apply],
  );
  const act = useCallback(
    async (value: VoiceEvent) => {
      setActionBusy(true);
      setError('');
      try {
        await event(value);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء.');
      } finally {
        setActionBusy(false);
      }
    },
    [event],
  );
  async function join() {
    setJoining(true);
    setError('');
    try {
      const invite = inviteRef.current || captureInvite(roomId);
      inviteRef.current = invite;
      apply(
        await voiceRequest<VoiceSnapshot>(`rooms/${roomId}/join`, {
          ...(password ? { password } : {}),
          ...(invite ? { invite } : {}),
        }),
      );
      setJoinRequired(false);
      clearSavedInvite(roomId);
      inviteRef.current = null;
    } catch (err) {
      setJoinRequired(true);
      setAuthRequired(err instanceof VoiceRequestError && err.status === 401);
      setError(err instanceof Error ? err.message : 'تعذر دخول الغرفة.');
    } finally {
      setJoining(false);
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    if (inviteRoomRef.current !== roomId) {
      inviteRef.current = null;
      inviteRoomRef.current = roomId;
    }
    inviteRef.current ||= captureInvite(roomId);
    async function open() {
      try {
        const initial = await voiceRequest<VoiceSnapshot>(`rooms/${roomId}`);
        if (cancelled) return;
        apply(initial);
        if (initial.me) {
          clearSavedInvite(roomId);
          inviteRef.current = null;
          setLoading(false);
          return;
        }
      } catch {
        /* Join endpoint safely handles private rooms and invitations. */
      }
      if (cancelled) return;
      const invite = inviteRef.current || captureInvite(roomId);
      inviteRef.current = invite;
      try {
        const joined = await voiceRequest<VoiceSnapshot>(`rooms/${roomId}/join`, {
          ...(invite ? { invite } : {}),
        });
        if (!cancelled) {
          apply(joined);
          clearSavedInvite(roomId);
          inviteRef.current = null;
        }
      } catch (err) {
        if (!cancelled) {
          setJoinRequired(true);
          setAuthRequired(err instanceof VoiceRequestError && err.status === 401);
          setError(err instanceof Error ? err.message : 'تعذر دخول الغرفة.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void open();
    void voiceRequest<VoicePreferences>('preferences')
      .then((p) => {
        if (!cancelled) setPreferences(p);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [roomId, apply]);
  const admitted = Boolean(snapshot?.me);
  const activeRoom = Boolean(snapshot?.room.active);
  useEffect(() => {
    if (!admitted || !activeRoom || joinRequired) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await voiceRequest<VoiceSnapshot>(`rooms/${roomId}/events`);
        if (!stopped) {
          apply(next);
          if (!next.me && next.room.active && !leaving.current) {
            setJoinRequired(true);
            setError('انتهت جلستك في الغرفة. يمكنك محاولة الانضمام مرة أخرى.');
          }
        }
      } catch (err) {
        if (!stopped) {
          setError(err instanceof Error ? err.message : 'انقطع تحديث الغرفة. نحاول إعادة الاتصال.');
          if (err instanceof VoiceRequestError && [401, 403, 404, 410].includes(err.status)) {
            // Revocation/expiry must tear down media immediately, before any retry.
            setJoinRequired(true);
            setAuthRequired(err.status === 401);
            const current = snapshotRef.current;
            if (current)
              apply({
                ...current,
                me: null,
                ...(err.status === 410 ? { room: { ...current.room, active: false } } : {}),
              });
            if (err.status === 410) {
              setJoinRequired(false);
              return;
            }
            try {
              const roomState = await voiceRequest<VoiceSnapshot>(`rooms/${roomId}`);
              if (!stopped && !roomState.room.active) {
                apply(roomState);
                setJoinRequired(false);
              }
            } catch {
              /* Private membership denial reveals no room data. */
            }
          }
        }
      } finally {
        if (!stopped) timer = setTimeout(() => void poll(), 2500);
      }
    }
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [roomId, admitted, activeRoom, joinRequired, apply]);
  useEffect(() => {
    const sequence = ++mountSequence.current;
    function unload() {
      if (!leaving.current && snapshotRef.current?.me)
        navigator.sendBeacon(
          `/api/voice/rooms/${roomId}/leave`,
          new Blob(['{}'], { type: 'application/json' }),
        );
    }
    window.addEventListener('pagehide', unload);
    return () => {
      window.removeEventListener('pagehide', unload);
      // A StrictMode remount increments the sequence before this deferred cleanup.
      setTimeout(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        if (mountSequence.current === sequence) unload();
      }, 0);
    };
  }, [roomId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function preference(action: VoicePreferencesAction) {
    try {
      setPreferences(await voiceRequest<VoicePreferences>('preferences', action, 'PATCH'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التفضيل.');
    }
  }
  async function share() {
    try {
      let url = new URL(`/voice/${roomId}`, window.location.origin).toString();
      if (snapshot?.room.isPrivate && snapshot.me?.role === 'host') {
        const result = await voiceRequest<{ url: string }>(`rooms/${roomId}/invite`, {});
        url = new URL(result.url, window.location.origin).toString();
      }

      if (navigator.share)
        await navigator.share({ title: snapshot?.room.name || 'تحدي لايف', url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice('تم نسخ رابط الغرفة.');
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError'))
        setError('تعذرت مشاركة الرابط. يمكنك نسخه من شريط العنوان.');
    }
  }
  async function leave(navigate = true, rejectOnFailure = false) {
    leaving.current = true;
    setActionBusy(true);
    try {
      if (snapshotRef.current?.me && snapshotRef.current.room.active)
        await voiceRequest(`rooms/${roomId}/leave`, {});
      onLeave?.();
      if (navigate) router.push('/voice');
    } catch (err) {
      leaving.current = false;
      setActionBusy(false);
      setError(err instanceof Error ? err.message : 'تعذر إنهاء الجلسة. حاول مرة أخرى.');
      if (rejectOnFailure) throw err;
    }
  }
  useImperativeHandle(ref, () => ({ leave: () => leave(false, true) }));
  const room = snapshot?.room;
  const me = snapshot?.me;
  const canModerate =
    me?.role === 'host' || (me?.role === 'moderator' && Boolean(room?.moderatorsCanManage));
  const host = me?.role === 'host';
  const participants = snapshot?.participants || [];
  const selected = participants.find((p) => p.id === profileId);
  const requests = participants.filter((p) => p.requestedSeat !== null);
  const listeners = participants.filter(
    (p) => p.seatIndex === null && p.name.toLowerCase().includes(participantSearch.toLowerCase()),
  );
  const onSeat = me?.seatIndex !== null && me?.seatIndex !== undefined;
  return (
    <>
      {snapshot && (
        <PersistentVoiceDock
          snapshot={snapshot}
          deafened={deafened}
          busy={actionBusy}
          visible={visible}
          error={error}
          mediaPending={mediaPending}
          onMute={() => void act({ type: 'mute', muted: !me?.muted })}
          onDeafen={() => setDeafened((value) => !value)}
          onLeave={() => void leave(visible)}
        >
          {room?.active && me && !joinRequired && (
            <AudioSession
              roomId={roomId}
              participant={me}
              muted={me.muted}
              deafened={deafened}
              volume={volume}
              mutedUserIds={preferences.mutedUsers}
              onStateChange={setAudioState}
              onSpeakersChange={setSpeakers}
            />
          )}
        </PersistentVoiceDock>
      )}
      {visible && (
        <VoiceShell user={user} room modalActive={chatOverlayOpen}>
          {loading ? (
            <div className="v-loading v-room-loading" role="status">
              <AudioLines />
              نجهّز لك مكانًا في المجلس…
            </div>
          ) : joinRequired ? (
            <div className="v-join-panel">
              <LockKeyhole size={40} />
              <h1>{authRequired ? 'انتهت جلسة الدخول' : room?.name || 'انضم إلى الغرفة'}</h1>
              <p>
                {authRequired
                  ? 'سجّل الدخول من جديد للعودة إلى اللقاء.'
                  : 'ادخل كلمة المرور إن كانت مطلوبة، ثم انضم إلى اللقاء.'}
              </p>
              {authRequired ? (
                <Link
                  className="v-button"
                  href={`/auth/sign-in?next=${encodeURIComponent(`/voice/${roomId}`)}`}
                >
                  تسجيل الدخول من جديد
                </Link>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void join();
                  }}
                >
                  <Input
                    label="كلمة مرور الغرفة"
                    value={password}
                    type="password"
                    autoComplete="current-password"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {error && (
                    <p role="alert" className="v-error">
                      {error}
                    </p>
                  )}
                  <button className="v-button" disabled={joining}>
                    {joining ? 'جارٍ الانضمام…' : 'الانضمام للغرفة'}
                    <Headphones size={19} />
                  </button>
                </form>
              )}
              <Link href="/voice">العودة إلى الغرف</Link>
            </div>
          ) : !room ? (
            <EmptyState title="تعذر العثور على الغرفة">
              <Link className="v-button" href="/voice">
                العودة إلى الغرف
              </Link>
            </EmptyState>
          ) : (
            <>
              <div className="v-room-breadcrumb" inert={chatOverlayOpen}>
                <Link href="/voice">
                  <ArrowRight size={17} />
                  الغرف الصوتية
                </Link>
                <span>/</span>
                <span>{room.category}</span>
              </div>
              <section className="v-room-hero" inert={chatOverlayOpen}>
                <VoiceCover src={room.cover} priority sizes="(max-width: 800px) 100vw, 80vw" />
                <div className="v-room-hero-top">
                  <LiveBadge active={room.active} waiting={room.participantCount === 0} />
                  <div>
                    <button
                      className={`v-icon v-glass ${preferences.favorites.includes(roomId) ? 'is-selected' : ''}`}
                      onClick={() =>
                        void preference({
                          type: 'favorite',
                          id: roomId,
                          enabled: !preferences.favorites.includes(roomId),
                        })
                      }
                      aria-label="إضافة الغرفة للمفضلة"
                      aria-pressed={preferences.favorites.includes(roomId)}
                    >
                      <Heart size={19} />
                    </button>
                    <button
                      className="v-icon v-glass"
                      onClick={() => void share()}
                      aria-label="مشاركة الغرفة"
                    >
                      <Share2 size={19} />
                    </button>
                    <button
                      className="v-icon v-glass"
                      onClick={() => {
                        if (host) setSettings(true);
                        else {
                          setReportUserId(null);
                          setReportOpen(true);
                        }
                      }}
                      aria-label={host ? 'إعدادات الغرفة' : 'الإبلاغ عن الغرفة'}
                    >
                      <MoreHorizontal size={22} />
                    </button>
                  </div>
                </div>
                <div className="v-room-hero-content">
                  <span className="v-category-label">
                    {room.category}
                    {room.isPrivate && ' · خاصة'}
                  </span>
                  <h1>{room.name}</h1>
                  <p>{room.description}</p>
                  <div className="v-room-hero-meta">
                    <button onClick={() => setProfileId(room.hostId)}>
                      <Avatar user={{ name: room.hostName, image: room.hostImage }} size={31} />
                      <span>{room.hostName}</span>
                      <Crown size={16} />
                    </button>
                    <span>
                      <Users size={16} />
                      {number(room.participantCount)} حاضر
                    </span>
                    <span>
                      <Headphones size={16} />
                      {number(room.listenerCount)} مستمع
                    </span>
                  </div>
                </div>
              </section>
              {error && (
                <div className="v-error v-room-error" role="alert">
                  <span>{error}</span>
                  <button
                    className="v-icon"
                    aria-label="إغلاق التنبيه"
                    onClick={() => setError('')}
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              {mediaPending && (
                <p className="v-error" role="status">
                  حُفظ التغيير، لكن تطبيق صلاحيات الصوت لم يتأكد بعد. جارٍ محاولة المزامنة؛ لا تُعد
                  إرسال الرسائل.
                </p>
              )}
              {!room.active && (
                <div className="v-ended" role="status">
                  <Crown size={24} />
                  <h2>انتهى هذا اللقاء</h2>
                  <p>نلتقي على صوت جديد قريبًا.</p>
                  <Link className="v-button" href="/voice">
                    استكشاف الغرف
                  </Link>
                </div>
              )}
              {room.active && (
                <div className={`v-room-columns ${chatOpen ? 'v-chat-open' : ''}`}>
                  <div className="v-stage-column" inert={chatOverlayOpen}>
                    <section className="v-stage">
                      <div className="v-stage-heading">
                        <div>
                          <p className="v-eyebrow">مساحة الحديث</p>
                          <h2>
                            <Mic size={18} />
                            على الميكروفون
                          </h2>
                        </div>
                        <span className={`v-connection v-state-${audioState}`}>
                          <span />
                          {audioState === 'connected'
                            ? 'الصوت متصل'
                            : audioState === 'reconnecting'
                              ? 'إعادة الاتصال'
                              : audioState === 'setup-needed'
                                ? 'الصوت يحتاج إعدادًا'
                                : audioState === 'connecting'
                                  ? 'جارٍ الاتصال'
                                  : 'الصوت غير متصل'}
                        </span>
                      </div>
                      <div className="v-seats">
                        {Array.from({ length: room.seatCount }, (_, index) => {
                          const person = participants.find((p) => p.seatIndex === index);
                          const locked = room.lockedSeats.includes(index);
                          return (
                            <div
                              className={`v-seat ${person?.role === 'host' ? 'v-host-seat' : ''} ${person && speakers.includes(person.id) ? 'is-speaking' : ''}`}
                              key={index}
                            >
                              {person ? (
                                <>
                                  <button
                                    className="v-seat-person"
                                    onClick={() => setProfileId(person.id)}
                                    aria-label={`${person.name}، ${roleLabels[person.role]}${speakers.includes(person.id) ? '، يتحدث الآن' : ''}${person.muted || person.moderatorMuted ? '، الميكروفون مكتوم' : ''}`}
                                  >
                                    <span className="v-seat-avatar">
                                      <Avatar
                                        user={person}
                                        size={72}
                                        speaking={speakers.includes(person.id)}
                                      />
                                      {person.role === 'host' ? (
                                        <Crown className="v-seat-role" size={20} />
                                      ) : person.role === 'moderator' ? (
                                        <ShieldCheck className="v-seat-role" size={19} />
                                      ) : null}
                                      <span
                                        className={`v-mic-status ${person.muted || person.moderatorMuted ? 'is-muted' : ''}`}
                                      >
                                        {person.muted || person.moderatorMuted ? (
                                          <MicOff size={13} />
                                        ) : (
                                          <Mic size={13} />
                                        )}
                                      </span>
                                      {person.handRaised && (
                                        <span className="v-seat-hand">
                                          <Hand size={16} />
                                        </span>
                                      )}
                                    </span>
                                    <strong>{person.id === user.id ? 'أنت' : person.name}</strong>
                                    <small>{roleLabels[person.role]}</small>
                                  </button>
                                  {speakers.includes(person.id) && (
                                    <span className="v-speaking-label">
                                      <AudioLines size={12} />
                                      يتحدث الآن
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <button
                                    className="v-empty-seat"
                                    disabled={
                                      !me ||
                                      locked ||
                                      onSeat ||
                                      (!room.allowMicRequests && !canModerate) ||
                                      actionBusy
                                    }
                                    onClick={() =>
                                      void act({ type: 'request-seat', seatIndex: index })
                                    }
                                    aria-label={
                                      locked
                                        ? `المقعد ${index + 1} مقفل`
                                        : `طلب المقعد ${index + 1}`
                                    }
                                  >
                                    <span>
                                      {locked ? <LockKeyhole size={25} /> : <Mic size={25} />}
                                    </span>
                                    <strong>{locked ? 'مقعد مقفل' : 'اطلب المقعد'}</strong>
                                    <small>مقعد {number(index + 1)}</small>
                                  </button>
                                  {canModerate && (
                                    <button
                                      className="v-seat-lock"
                                      onClick={() =>
                                        void act({
                                          type: 'lock-seat',
                                          seatIndex: index,
                                          locked: !locked,
                                        })
                                      }
                                      aria-label={
                                        locked
                                          ? `فتح المقعد ${index + 1}`
                                          : `قفل المقعد ${index + 1}`
                                      }
                                    >
                                      {locked ? 'فتح' : 'قفل'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p className="v-stage-note">
                        <ShieldCheck size={14} />
                        يضيء إطار المتحدث عند وصول الصوت فعليًا.
                      </p>
                    </section>
                    {canModerate && requests.length > 0 && (
                      <section className="v-requests">
                        <h3>
                          <Hand size={18} />
                          طلبات الميكروفون <span>{number(requests.length)}</span>
                        </h3>
                        {requests.map((p) => (
                          <div key={p.id}>
                            <Avatar user={p} size={34} />
                            <span>{p.name}</span>
                            <button
                              className="v-button v-small"
                              disabled={actionBusy}
                              onClick={() => {
                                const seat = requestedSeat(p, room, participants);
                                if (seat !== undefined && seat !== null)
                                  void act({ type: 'approve-seat', userId: p.id, seatIndex: seat });
                                else setError('لا يوجد مقعد متاح الآن.');
                              }}
                            >
                              <Check size={15} />
                              قبول
                            </button>
                            <button
                              className="v-icon"
                              onClick={() => void act({ type: 'deny-seat', userId: p.id })}
                              aria-label={`رفض طلب ${p.name}`}
                            >
                              <X size={17} />
                            </button>
                          </div>
                        ))}
                      </section>
                    )}
                    <section className="v-listeners">
                      <header>
                        <h2>
                          <Headphones size={19} />
                          المستمعون <span>{number(room.listenerCount)}</span>
                        </h2>
                        <label className="v-search">
                          <Search size={16} />
                          <input
                            type="search"
                            aria-label="البحث في المستمعين"
                            placeholder="ابحث عن اسم…"
                            value={participantSearch}
                            onChange={(e) => setParticipantSearch(e.target.value)}
                          />
                        </label>
                      </header>
                      <div className="v-listener-grid">
                        {listeners.map((p) => (
                          <button key={p.id} onClick={() => setProfileId(p.id)}>
                            <span>
                              <Avatar user={p} size={43} />
                              {p.handRaised && <Hand className="v-listener-hand" size={15} />}
                            </span>
                            <strong>{p.id === user.id ? 'أنت' : p.name}</strong>
                          </button>
                        ))}
                        {!listeners.length && (
                          <p className="v-muted">
                            {participantSearch
                              ? 'لا يوجد اسم يطابق البحث.'
                              : 'المستمعون القادمون لهم مكان هنا.'}
                          </p>
                        )}
                      </div>
                    </section>
                  </div>
                  <div
                    className="v-chat-column"
                    ref={chatRef}
                    role={chatOverlayOpen ? 'dialog' : undefined}
                    aria-modal={chatOverlayOpen ? true : undefined}
                    aria-label={chatOverlayOpen ? 'دردشة الغرفة' : undefined}
                    tabIndex={chatOverlayOpen ? -1 : undefined}
                  >
                    <VoiceChat
                      messages={(snapshot?.messages || []).filter(
                        (m) => !preferences.blockedUsers.includes(m.userId),
                      )}
                      me={me || null}
                      enabled={room.chatEnabled}
                      canModerate={canModerate}
                      onEvent={event}
                      onProfile={setProfileId}
                      onError={setError}
                      close={closeChat}
                    />
                  </div>
                </div>
              )}
              <div className="v-audio-session" inert={chatOverlayOpen}>
                <Link href="/games/" className="v-button v-outline">
                  افتح الألعاب وابقَ على المايك
                </Link>
                <label className="v-volume">
                  <Volume2 size={16} />
                  <span>مستوى الاستماع</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                  />
                </label>
              </div>
              {room.active && (
                <div className="v-room-controls" inert={chatOverlayOpen}>
                  <div className="v-controls-me">
                    <Avatar user={user} size={37} />
                    <span>
                      <strong>{me ? roleLabels[me.role] : 'لم تنضم'}</strong>
                      <small>
                        {me?.moderatorMuted
                          ? 'كتمك المشرف'
                          : onSeat
                            ? 'على المنصة'
                            : 'أهلاً بك في المجلس'}
                      </small>
                    </span>
                  </div>
                  <div className="v-control-actions">
                    <button
                      className={`v-control v-main-mic ${!onSeat || me?.muted || me?.moderatorMuted ? 'is-muted' : ''}`}
                      disabled={!onSeat || me?.moderatorMuted || actionBusy}
                      aria-pressed={Boolean(me?.muted)}
                      onClick={() => void act({ type: 'mute', muted: !me?.muted })}
                    >
                      {!onSeat || me?.muted || me?.moderatorMuted ? <MicOff /> : <Mic />}
                      <span>
                        {onSeat
                          ? me?.muted
                            ? 'تشغيل الميكروفون'
                            : 'كتم الميكروفون'
                          : 'الميكروفون مكتوم'}
                      </span>
                    </button>
                    {!onSeat ? (
                      <button
                        className={`v-control ${me?.requestedSeat !== null ? 'is-selected' : ''}`}
                        aria-pressed={Boolean(me && me.requestedSeat !== null)}
                        disabled={(!room.allowMicRequests && !canModerate) || actionBusy || !me}
                        onClick={() => void act({ type: 'request-seat' })}
                      >
                        <Mic />
                        <span>
                          {canModerate
                            ? 'الصعود للمنصة'
                            : me?.requestedSeat !== null
                              ? 'طلبك قيد المراجعة'
                              : 'طلب الميكروفون'}
                        </span>
                      </button>
                    ) : (
                      <button
                        className="v-control"
                        disabled={actionBusy}
                        onClick={() => void act({ type: 'leave-seat' })}
                      >
                        <LogOut />
                        <span>مغادرة المقعد</span>
                      </button>
                    )}
                    <button
                      className={`v-control ${me?.handRaised ? 'is-selected' : ''}`}
                      aria-pressed={Boolean(me?.handRaised)}
                      disabled={!me || actionBusy}
                      onClick={() => void act({ type: 'hand', raised: !me?.handRaised })}
                    >
                      <Hand />
                      <span>{me?.handRaised ? 'إنزال اليد' : 'رفع اليد'}</span>
                    </button>
                    <button
                      className="v-control"
                      aria-pressed={deafened}
                      onClick={() => setDeafened((v) => !v)}
                    >
                      {deafened ? <VolumeX /> : <Volume2 />}
                      <span>{deafened ? 'تشغيل السماعات' : 'كتم السماعات'}</span>
                    </button>
                    <button
                      className={`v-control v-chat-toggle ${chatOpen ? 'is-selected' : ''}`}
                      aria-expanded={chatOpen}
                      onClick={() => setChatOpen((v) => !v)}
                    >
                      <MessageCircle />
                      <span>الدردشة</span>
                    </button>
                  </div>
                  <button className="v-leave" disabled={actionBusy} onClick={() => void leave()}>
                    <LogOut size={18} />
                    <span>مغادرة</span>
                  </button>
                </div>
              )}
              <Dialog
                open={Boolean(profileId)}
                onOpenChange={onProfileOpenChange}
                title={
                  selected?.name || (profileId === room.hostId ? room.hostName : 'ملف المشارك')
                }
                className="v-dialog v-profile-dialog"
              >
                {selected ? (
                  <>
                    <div className="v-profile-head">
                      <Avatar user={selected} size={88} />
                      <h3>{selected.name}</h3>
                      <p>
                        {roleLabels[selected.role]}
                        {selected.moderatorMuted ? ' · الميكروفون مكتوم من المشرف' : ''}
                      </p>
                    </div>
                    {selected.id !== user.id && (
                      <div className="v-profile-actions">
                        <button
                          className="v-button"
                          onClick={() =>
                            void preference({
                              type: 'follow',
                              id: selected.id,
                              enabled: !preferences.following.includes(selected.id),
                            })
                          }
                        >
                          <Users size={17} />
                          {preferences.following.includes(selected.id)
                            ? 'إلغاء المتابعة'
                            : 'متابعة'}
                        </button>
                        <button
                          className="v-button v-outline"
                          onClick={() =>
                            void preference({
                              type: 'mute',
                              id: selected.id,
                              enabled: !preferences.mutedUsers.includes(selected.id),
                            })
                          }
                        >
                          {preferences.mutedUsers.includes(selected.id) ? (
                            <Volume2 size={17} />
                          ) : (
                            <VolumeX size={17} />
                          )}
                          {preferences.mutedUsers.includes(selected.id)
                            ? 'إلغاء الكتم لدي'
                            : 'كتم الصوت لدي'}
                        </button>
                        <button
                          className="v-text-button"
                          onClick={() =>
                            void preference({
                              type: 'block',
                              id: selected.id,
                              enabled: !preferences.blockedUsers.includes(selected.id),
                            })
                          }
                        >
                          {preferences.blockedUsers.includes(selected.id)
                            ? 'إلغاء الحظر'
                            : 'حظر رسائل المستخدم'}
                        </button>
                        <button
                          className="v-text-button"
                          onClick={() => {
                            setReportUserId(selected.id);
                            setProfileId(null);
                            setReportOpen(true);
                          }}
                        >
                          <Flag size={15} />
                          الإبلاغ عن المستخدم
                        </button>
                      </div>
                    )}
                    {canModerate && selected.id !== user.id && selected.role !== 'host' && (
                      <div className="v-moderation">
                        <h4>
                          <ShieldCheck size={16} />
                          إدارة المشارك
                        </h4>
                        <button
                          className="v-button v-outline"
                          disabled={actionBusy}
                          onClick={() =>
                            void act({
                              type: 'moderator-mute',
                              userId: selected.id,
                              muted: !selected.moderatorMuted,
                            })
                          }
                        >
                          {selected.moderatorMuted ? 'رفع الكتم الإداري' : 'كتم الميكروفون'}
                        </button>
                        {host && (
                          <button
                            className="v-button v-outline"
                            disabled={actionBusy}
                            onClick={() =>
                              void act({
                                type: 'role',
                                userId: selected.id,
                                role: selected.role === 'moderator' ? 'listener' : 'moderator',
                              })
                            }
                          >
                            {selected.role === 'moderator' ? 'إلغاء الإشراف' : 'تعيين مشرف'}
                          </button>
                        )}
                        {host && selected.seatIndex !== null && (
                          <button
                            className="v-button v-outline"
                            disabled={actionBusy}
                            onClick={() =>
                              void act({ type: 'role', userId: selected.id, role: 'listener' })
                            }
                          >
                            إنزال عن المقعد
                          </button>
                        )}
                        <button
                          className="v-danger-button"
                          disabled={actionBusy}
                          onClick={() => {
                            void act({ type: 'remove', userId: selected.id });
                            setProfileId(null);
                          }}
                        >
                          إزالة من الغرفة
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="v-muted">هذا المشارك غير موجود في الغرفة الآن.</p>
                )}
              </Dialog>
              {host && (
                <>
                  <RoomSettings
                    key={`${room.id}-${settings}`}
                    room={room}
                    open={settings}
                    onOpenChange={setSettings}
                    onSave={apply}
                  />
                  <button className="v-close-room" onClick={() => setCloseRoom(true)}>
                    إنهاء البث للجميع
                  </button>
                </>
              )}
              <Dialog
                open={closeRoom}
                onOpenChange={setCloseRoom}
                title="إنهاء اللقاء؟"
                description="ستنتهي الجلسة الصوتية لجميع الموجودين في الغرفة."
                className="v-dialog"
              >
                <div className="v-dialog-actions">
                  <button
                    className="v-danger-button"
                    disabled={actionBusy}
                    onClick={() => {
                      void act({ type: 'close' });
                      setCloseRoom(false);
                    }}
                  >
                    إنهاء البث
                  </button>
                  <button className="v-button v-outline" onClick={() => setCloseRoom(false)}>
                    متابعة اللقاء
                  </button>
                </div>
              </Dialog>
              <Dialog
                open={reportOpen}
                onOpenChange={setReportOpen}
                title="إرسال بلاغ"
                className="v-dialog"
              >
                <form
                  className="v-create-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void event({
                      type: 'report',
                      ...(reportUserId ? { userId: reportUserId } : {}),
                      reason: reportReason,
                    })
                      .then(() => {
                        setReportOpen(false);
                        setNotice('وصل بلاغك إلى فريق الإشراف.');
                        setReportReason('');
                      })
                      .catch((err) =>
                        setError(err instanceof Error ? err.message : 'تعذر إرسال البلاغ.'),
                      );
                  }}
                >
                  <Input
                    label="سبب الإبلاغ"
                    required
                    minLength={5}
                    maxLength={500}
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                  />
                  <button className="v-button">إرسال البلاغ</button>
                </form>
              </Dialog>
              {notice && (
                <div className="v-toast" role="status">
                  <Check size={18} />
                  {notice}
                </div>
              )}
            </>
          )}
        </VoiceShell>
      )}
    </>
  );
}
