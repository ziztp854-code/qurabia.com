'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
} from 'react';
import {
  ArrowRight,
  AudioLines,
  Check,
  Crown,
  Flag,
  Gift,
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
  UserCheck,
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
  VoiceMessage,
} from '@/lib/voice/types';
import { AudioSession, type VoiceAudioHandle } from './audio-session';
import { MemberEntrance, voiceArrivals, type VoiceArrival } from './member-entrance';
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
import { MemberName } from './member-name';
import roomStyles from './room-layout.module.css';
import { VoiceGifts } from './voice-gifts';
import liveStyles from './live-room.module.css';
import { GiftCelebration } from './gift-celebration';
import { requestVoiceMicrophone } from './microphone-permission';
import { VoiceSocial } from './voice-social';
import { VoiceRoomAudience } from './voice-room-audience';
import { withLiveMessages, type VoiceLiveMessage } from './voice-live-message';

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
  const [relationship, setRelationship] = useState<{
    peerId: string;
    friend: boolean;
    followsYou: boolean;
  } | null>(null);
  const [followingBusy, setFollowingBusy] = useState<string | null>(null);
  const [socialOpen, setSocialOpen] = useState(false);
  const [privatePeer, setPrivatePeer] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const onProfileOpenChange = useCallback((open: boolean) => {
    if (!open) setProfileId(null);
  }, []);
  const [chatOpen, setChatOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [showEmptySeats, setShowEmptySeats] = useState(false);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [giftArrival, setGiftArrival] = useState<VoiceMessage | null>(null);
  const dismissGift = useCallback(() => setGiftArrival(null), []);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState<string | undefined>();
  const closeGifts = useCallback(() => setGiftsOpen(false), []);
  function openGifts(recipientId?: string) {
    setProfileId(null);
    setChatOpen(false);
    setGiftRecipient(recipientId);
    setGiftsOpen(true);
  }
  const chatRef = useRef<HTMLDivElement>(null);
  const compactChat = useVoiceMediaQuery('(max-width: 1020px)');
  const narrowHeader = useVoiceMediaQuery('(max-width: 760px)');
  const closeChat = useCallback(() => setChatOpen(false), []);
  const [deafened, setDeafened] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [audioState, setAudioState] = useState('disconnected');
  const [audioError, setAudioError] = useState('');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const audioController = useRef<VoiceAudioHandle>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDetailsElement>(null);
  const audioSettingsLauncher = useRef<HTMLButtonElement | null>(null);
  const [mediaStopped, setMediaStopped] = useState(false);
  useEffect(() => {
    const surface = surfaceRef.current;
    const controls = controlsRef.current;
    if (
      !visible ||
      loading ||
      joinRequired ||
      authRequired ||
      !snapshot?.room.active ||
      !surface ||
      !controls
    )
      return;
    const updateInset = () => {
      // offsetHeight stays in CSS pixels when text or page scaling wraps the controls.
      const height = controls.offsetHeight;
      if (height > 0) surface.style.setProperty('--room-controls-space', `${height + 16}px`);
    };
    updateInset();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateInset);
    observer?.observe(controls);
    window.addEventListener('resize', updateInset);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateInset);
      surface.style.removeProperty('--room-controls-space');
    };
  }, [visible, snapshot?.room.active, roomId, loading, joinRequired, authRequired]);
  const openAudioSettings = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      audioSettingsLauncher.current = event.currentTarget;
      setAudioSettingsOpen(true);
      if (narrowHeader && headerMenuRef.current) headerMenuRef.current.open = false;
      requestAnimationFrame(() =>
        surfaceRef.current
          ?.querySelector<HTMLElement>('aside[aria-label="جلسة الصوت المستمرة"] details > summary')
          ?.focus(),
      );
    },
    [narrowHeader],
  );
  const [arrivals, setArrivals] = useState<VoiceArrival[]>([]);
  const dismissArrival = useCallback(() => setArrivals((current) => current.slice(1)), []);
  const [settings, setSettings] = useState(false);
  const [closeRoom, setCloseRoom] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [localMuted, setLocalMuted] = useState<boolean | null>(null);
  const mutePending = useRef(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [mediaPending, setMediaPending] = useState(false);
  const inviteRef = useRef<string | null>(null);
  const inviteRoomRef = useRef(roomId);
  const mountSequence = useRef(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportUserId, setReportUserId] = useState<string | null>(null);
  const chatOverlayOpen = chatOpen && compactChat && !profileId && !reportOpen && !giftsOpen;
  useVoiceOverlay(chatOverlayOpen && visible, chatRef, closeChat);
  const leaving = useRef(false);
  const snapshotRef = useRef<VoiceSnapshot | null>(null);
  const liveMessages = useRef<VoiceLiveMessage[]>([]);
  const apply = useCallback((data: VoiceSnapshot) => {
    if (leaving.current) return;
    const accepted = nextSnapshot(snapshotRef.current, data);
    if (accepted === snapshotRef.current) return;
    const next = withLiveMessages(accepted, liveMessages.current);
    // Initial history is not a live event. Polling the same message must not replay it.
    const previous = snapshotRef.current;
    if (previous) {
      const seen = new Set(previous.messages.map((message) => message.id));
      const gifts = next.messages.filter((message) => message.gift && !seen.has(message.id));
      if (gifts.length) setGiftArrival(gifts[gifts.length - 1]);
    }
    const entrants = voiceArrivals(snapshotRef.current, next);
    if (entrants.length)
      setArrivals((current) =>
        [
          ...current.filter((entry) => entry.expiresAt > Date.now()),
          ...entrants.slice(-3).map((member, index) => ({
            member,
            key: `${member.id}:${member.joinedAt}`,
            expiresAt: Date.now() + 6000 + index * 3000,
          })),
        ].slice(-3),
      );
    snapshotRef.current = next;
    setSnapshot(next);
    if (data.mediaSyncPending !== undefined) setMediaPending(data.mediaSyncPending);
  }, []);
  const receiveRoomMessage = useCallback(
    (packet: VoiceLiveMessage) => {
      const current = snapshotRef.current;
      if (
        !current?.me ||
        !current.room.active ||
        packet.roomId !== current.room.id ||
        packet.cursor <= current.cursor ||
        preferences.blockedUsers.includes(packet.message.userId)
      )
        return;
      if (!liveMessages.current.some((entry) => entry.message.id === packet.message.id))
        liveMessages.current.push(packet);
      apply({ ...current });
    },
    [apply, preferences.blockedUsers],
  );
  const event = useCallback(
    async (value: VoiceEvent) => {
      const result = await voiceRequest<VoiceSnapshot>(`rooms/${roomId}/events`, value);
      apply(result);
    },
    [roomId, apply],
  );
  const act = useCallback(
    async (value: VoiceEvent) => {
      if (value.type === 'mute' && mutePending.current) return;
      const mute = value.type === 'mute';
      if (mute) {
        mutePending.current = true;
        setMuteBusy(true);
        if (value.muted) setLocalMuted(true);
      } else setActionBusy(true);
      setError('');
      try {
        if (value.type === 'request-seat' || (value.type === 'mute' && !value.muted)) {
          setNotice('اسمح باستخدام الميكروفون من نافذة المتصفح للمتابعة.');
          await requestVoiceMicrophone();
          setNotice(value.type === 'request-seat' ? 'الميكروفون جاهز. جارٍ طلب المايك…' : '');
        }
        if (value.type === 'mute') setLocalMuted(value.muted);
        await event(value);
        if (mute) setLocalMuted(null);
      } catch (err) {
        if (mute) setLocalMuted(true);
        setNotice('');
        setError(err instanceof Error ? err.message : 'تعذر تنفيذ الإجراء.');
      } finally {
        if (mute) {
          mutePending.current = false;
          setMuteBusy(false);
        } else setActionBusy(false);
      }
    },
    [event],
  );
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshing = useRef(false);
  const refreshAgain = useRef(false);
  const refreshRoom = useCallback(() => {
    refreshAgain.current = true;
    if (refreshTimer.current || refreshing.current || leaving.current) return;
    async function refresh() {
      if (leaving.current) return;
      refreshTimer.current = null;
      refreshing.current = true;
      refreshAgain.current = false;
      try {
        apply(await voiceRequest<VoiceSnapshot>(`rooms/${roomId}`));
      } catch {
        /* The heartbeat handles admission and disconnect failures. */
      } finally {
        refreshing.current = false;
        if (refreshAgain.current && !leaving.current)
          refreshTimer.current = setTimeout(refresh, 750);
      }
    }
    refreshTimer.current = setTimeout(refresh, 750);
  }, [roomId, apply]);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
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
  useEffect(() => {
    if (!profileId || profileId === user.id) return;
    let cancelled = false;
    void voiceRequest<{ relationship: { friend: boolean; followsYou: boolean } }>(
      `social/${encodeURIComponent(profileId)}?profile=1`,
    )
      .then((data) => {
        if (!cancelled) setRelationship({ peerId: profileId, ...data.relationship });
      })
      .catch(() => {
        if (!cancelled) setRelationship(null);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, user.id, preferences.following, preferences.blockedUsers]);
  async function preference(action: VoicePreferencesAction) {
    if (action.type === 'follow') setFollowingBusy(action.id);
    try {
      setPreferences(await voiceRequest<VoicePreferences>('preferences', action, 'PATCH'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التفضيل.');
    } finally {
      if (action.type === 'follow') setFollowingBusy(null);
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
    // Local privacy must not depend on the server acknowledging departure.
    audioController.current?.stop();
    setMediaStopped(true);
    setLocalMuted(true);
    setAudioState('disconnected');
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
  const me = snapshot?.me ? { ...snapshot.me, muted: localMuted ?? snapshot.me.muted } : null;
  const canModerate =
    me?.role === 'host' || (me?.role === 'moderator' && Boolean(room?.moderatorsCanManage));
  const host = me?.role === 'host';
  const participants = snapshot?.participants || [];
  const selected = participants.find((p) => p.id === profileId);
  const requests = participants.filter((p) => p.requestedSeat !== null);
  const members = participants.filter((p) =>
    p.name.toLowerCase().includes(participantSearch.trim().toLowerCase()),
  );
  const onSeat = me?.seatIndex !== null && me?.seatIndex !== undefined;
  return (
    <div
      ref={surfaceRef}
      className={`${liveStyles.liveRoom} v-room-scope`}
      data-room-visible={visible}
    >
      {visible && room && (
        <div className={liveStyles.backdrop} aria-hidden="true">
          <VoiceCover src={room.cover} sizes="100vw" priority />
        </div>
      )}
      {snapshot && (
        <PersistentVoiceDock
          snapshot={{ ...snapshot, me }}
          deafened={deafened}
          busy={actionBusy}
          muteBusy={muteBusy}
          visible={visible}
          audioSettingsOpen={audioSettingsOpen}
          onAudioSettingsOpenChange={(open) => {
            setAudioSettingsOpen(open);
            if (!open && visible) {
              const launcher = narrowHeader
                ? headerMenuRef.current?.querySelector<HTMLElement>('summary')
                : audioSettingsLauncher.current ||
                  surfaceRef.current?.querySelector<HTMLElement>(
                    '[aria-label="حالة الصوت وإعدادات الاتصال"]',
                  );
              requestAnimationFrame(() => launcher?.focus());
            }
          }}
          overlayActive={
            chatOverlayOpen ||
            Boolean(profileId) ||
            socialOpen ||
            reportOpen ||
            settings ||
            giftsOpen ||
            closeRoom ||
            membersOpen
          }
          error={error}
          mediaPending={mediaPending}
          onMute={() => void act({ type: 'mute', muted: !me?.muted })}
          onDeafen={() => setDeafened((value) => !value)}
          onLeave={() => void leave(visible)}
        >
          {room?.active && me && !joinRequired && !mediaStopped && (
            <AudioSession
              ref={audioController}
              onErrorChange={setAudioError}
              onPlaybackBlockedChange={setPlaybackBlocked}
              roomId={roomId}
              participant={me}
              muted={me.muted}
              deafened={deafened}
              volume={volume}
              mutedUserIds={preferences.mutedUsers}
              onStateChange={setAudioState}
              onSpeakersChange={setSpeakers}
              onRoomChanged={refreshRoom}
              onRoomMessage={receiveRoomMessage}
            />
          )}
        </PersistentVoiceDock>
      )}
      <GiftCelebration
        message={giftArrival}
        visible={visible && !preferences.blockedUsers.includes(giftArrival?.userId || '')}
        onDismiss={dismissGift}
      />
      <MemberEntrance
        arrival={arrivals[0]}
        selfId={user.id}
        onDismiss={dismissArrival}
        visible={
          visible &&
          Boolean(me && room?.active) &&
          !profileId &&
          !socialOpen &&
          !membersOpen &&
          !reportOpen &&
          !settings &&
          !audioSettingsOpen &&
          !giftsOpen &&
          !giftArrival &&
          !closeRoom &&
          !chatOverlayOpen
        }
      />
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
              <header className={liveStyles.roomHeader} inert={chatOverlayOpen}>
                <div className={liveStyles.hostPill}>
                  <button
                    onClick={() => setProfileId(room.hostId)}
                    aria-label={`ملف المضيف ${room.hostName}`}
                  >
                    <Avatar user={{ name: room.hostName, image: room.hostImage }} size={40} />
                    <span>
                      <strong>
                        <MemberName
                          name={room.hostName}
                          badges={participants.find((p) => p.id === room.hostId)?.accountBadges}
                        />
                      </strong>
                      <small>مضيف المجلس</small>
                    </span>
                  </button>
                  {room.hostId !== user.id && (
                    <button
                      className={liveStyles.follow}
                      aria-pressed={preferences.following.includes(room.hostId)}
                      disabled={followingBusy === room.hostId}
                      aria-label={
                        preferences.following.includes(room.hostId)
                          ? 'إلغاء متابعة المضيف'
                          : 'متابعة المضيف'
                      }
                      onClick={() =>
                        void preference({
                          type: 'follow',
                          id: room.hostId,
                          enabled: !preferences.following.includes(room.hostId),
                        })
                      }
                    >
                      {preferences.following.includes(room.hostId) ? (
                        <Check size={17} />
                      ) : (
                        <Users size={17} />
                      )}
                      <span>
                        {preferences.following.includes(room.hostId) ? 'متابَع' : 'المتابعة'}
                      </span>
                    </button>
                  )}
                </div>
                <div className={liveStyles.presence}>
                  <LiveBadge active={room.active} waiting={room.participantCount === 0} />
                  <button
                    className="v-icon"
                    onClick={() => setMembersOpen(true)}
                    aria-label={`عرض أعضاء الغرفة، ${number(room.participantCount)} حاضر`}
                  >
                    <Users size={17} />
                    <span>{number(room.participantCount)}</span>
                  </button>
                </div>
                <details
                  ref={headerMenuRef}
                  className={liveStyles.headerMenu}
                  open={!narrowHeader}
                  onKeyDown={(e) => {
                    if (
                      narrowHeader &&
                      e.key === 'Escape' &&
                      e.currentTarget.contains(e.target as Node) &&
                      !(e.target as Element).closest('[role="dialog"]')
                    ) {
                      e.currentTarget.open = false;
                      e.currentTarget.querySelector('summary')?.focus();
                    }
                  }}
                >
                  <summary aria-label="خيارات الغرفة">
                    <MoreHorizontal size={21} aria-hidden="true" />
                  </summary>
                  <div className={liveStyles.headerActions}>
                    <button
                      className={`v-icon ${liveStyles.mobileAudioSettings}`}
                      aria-label="إعدادات الصوت والاتصال"
                      onClick={openAudioSettings}
                    >
                      <Headphones size={20} />
                    </button>
                    <VoiceSocial
                      user={user}
                      preferences={preferences}
                      onPreference={preference}
                      peerId={privatePeer}
                      onPeerChange={setPrivatePeer}
                      onVisibilityChange={setSocialOpen}
                    />
                    <button
                      className="v-icon"
                      aria-label="إضافة الغرفة للمفضلة"
                      aria-pressed={preferences.favorites.includes(roomId)}
                      onClick={() =>
                        void preference({
                          type: 'favorite',
                          id: roomId,
                          enabled: !preferences.favorites.includes(roomId),
                        })
                      }
                    >
                      <Heart size={20} />
                    </button>
                    <button
                      className="v-icon"
                      onClick={() => void share()}
                      aria-label="مشاركة الغرفة"
                    >
                      <Share2 size={19} />
                    </button>
                    <button
                      className="v-icon"
                      onClick={() => {
                        if (host) setSettings(true);
                        else {
                          setReportUserId(null);
                          setReportOpen(true);
                        }
                      }}
                      aria-label={host ? 'إعدادات الغرفة' : 'الإبلاغ عن الغرفة'}
                    >
                      <MoreHorizontal size={21} />
                    </button>
                  </div>
                </details>
                <button
                  className="v-icon"
                  onClick={() => void leave()}
                  disabled={actionBusy}
                  aria-label="مغادرة الغرفة"
                >
                  <X size={21} />
                </button>
              </header>
              <div className={liveStyles.roomHeading} inert={chatOverlayOpen}>
                <span>
                  <Headphones size={14} /> {room.category}
                  {room.isPrivate && ' · خاصة'}
                  <span className={liveStyles.mobileLive}>
                    <LiveBadge active={room.active} waiting={room.participantCount === 0} />
                  </span>
                </span>
                <h1>{room.name}</h1>
                {room.description && <p>{room.description}</p>}
              </div>
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
                <div
                  className={`v-room-columns ${roomStyles.layout} ${chatOpen ? 'v-chat-open' : ''}`}
                >
                  <div className="v-stage-column" inert={chatOverlayOpen}>
                    <section className="v-stage">
                      <div className="v-stage-heading" data-audio-state={audioState}>
                        <div>
                          <p className="v-eyebrow">مساحة الحديث</p>
                          <h2>
                            <Mic size={18} />
                            على الميكروفون
                          </h2>
                        </div>
                        <div className={roomStyles.stageActions}>
                          <button
                            type="button"
                            className={roomStyles.diagnosticsButton}
                            onClick={openAudioSettings}
                          >
                            <AudioLines size={16} aria-hidden="true" /> فحص الصوت
                          </button>
                          <button
                            type="button"
                            className={`v-connection v-state-${audioState} ${roomStyles.connectionButton}`}
                            onClick={openAudioSettings}
                            aria-label="حالة الصوت وإعدادات الاتصال"
                          >
                            <span />
                            {audioState === 'connected'
                              ? 'الصوت متصل'
                              : audioState === 'reconnecting'
                                ? 'إعادة الاتصال'
                                : audioState === 'setup-needed'
                                  ? 'الصوت يحتاج إعدادًا'
                                  : audioState === 'connecting'
                                    ? 'جارٍ الاتصال'
                                    : audioState === 'tab-conflict'
                                      ? 'الصوت مفتوح في نافذة أخرى'
                                      : 'الصوت غير متصل'}
                          </button>
                        </div>
                      </div>
                      {(audioError || playbackBlocked) && (
                        <div className={roomStyles.audioNotice} role="status">
                          <p>
                            {playbackBlocked ? 'اضغط لتفعيل سماع أصوات أعضاء الغرفة.' : audioError}
                          </p>
                          {playbackBlocked ? (
                            <button
                              className="v-button v-small"
                              onClick={() => void audioController.current?.startAudio()}
                            >
                              تفعيل الاستماع
                            </button>
                          ) : ['error', 'disconnected', 'setup-needed', 'tab-conflict'].includes(
                              audioState,
                            ) ? (
                            <button
                              className="v-button v-small"
                              onClick={() => audioController.current?.retry()}
                            >
                              إعادة الاتصال
                            </button>
                          ) : audioState === 'connected' ? (
                            <button className="v-button v-small" onClick={openAudioSettings}>
                              إعدادات الميكروفون
                            </button>
                          ) : (
                            <span>جارٍ استعادة الصوت…</span>
                          )}
                        </div>
                      )}
                      <div className="v-seats" data-show-empty={showEmptySeats}>
                        {Array.from({ length: room.seatCount }, (_, index) => {
                          const person = participants.find((p) => p.seatIndex === index);
                          const locked = room.lockedSeats.includes(index);
                          return (
                            <div
                              className={`v-seat ${!person ? `${roomStyles.emptySeat} v-seat-is-empty` : ''} ${person?.role === 'host' ? 'v-host-seat' : ''} ${person && speakers.includes(person.id) ? 'is-speaking' : ''}`}
                              key={index}
                            >
                              <span className="v-seat-number" aria-hidden="true">
                                {number(index + 1)}
                              </span>
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
                                      {person.role === 'moderator' ? (
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
                                    <strong title={person.name}>
                                      <MemberName
                                        name={person.id === user.id ? 'أنت' : person.name}
                                        badges={person.accountBadges}
                                      />
                                    </strong>
                                    <small>{roleLabels[person.role]}</small>
                                    <span className={`${roomStyles.seatState} v-seat-state`}>
                                      {speakers.includes(person.id) ? (
                                        <>
                                          <AudioLines size={13} /> يتحدث الآن
                                        </>
                                      ) : person.muted || person.moderatorMuted ? (
                                        <>
                                          <MicOff size={13} /> مكتوم
                                        </>
                                      ) : (
                                        <>
                                          <Mic size={13} /> المايك مفتوح
                                        </>
                                      )}
                                    </span>
                                    <span className={liveStyles.speakerWave} aria-hidden="true">
                                      {Array.from({ length: 9 }, (_, bar) => (
                                        <i key={bar} />
                                      ))}
                                    </span>
                                  </button>
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
                      {participants.filter((p) => p.seatIndex !== null).length < room.seatCount && (
                        <button
                          className="v-seat-expand v-text-button"
                          aria-expanded={showEmptySeats}
                          onClick={() => setShowEmptySeats((value) => !value)}
                        >
                          <Mic size={15} />
                          {showEmptySeats ? 'طي المقاعد الشاغرة' : 'عرض المقاعد الشاغرة'}
                        </button>
                      )}
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
                  </div>
                  <div
                    className="v-chat-column"
                    ref={chatRef}
                    role={chatOverlayOpen ? 'dialog' : undefined}
                    aria-modal={chatOverlayOpen ? true : undefined}
                    aria-label={chatOverlayOpen ? 'دردشة الغرفة' : undefined}
                    tabIndex={chatOverlayOpen ? -1 : undefined}
                  >
                    <VoiceRoomAudience
                      participants={participants}
                      speakers={speakers}
                      onProfile={setProfileId}
                      onMembers={() => setMembersOpen(true)}
                      inert={chatOverlayOpen}
                    />
                    <VoiceChat
                      messages={(snapshot?.messages || []).filter(
                        (m) => !preferences.blockedUsers.includes(m.userId),
                      )}
                      participants={snapshot?.participants}
                      me={me || null}
                      enabled={room.chatEnabled}
                      canModerate={canModerate}
                      onEvent={event}
                      onProfile={setProfileId}
                      onError={setError}
                      close={closeChat}
                      onGift={() => openGifts()}
                    />
                  </div>
                </div>
              )}
              <details className="v-audio-session" inert={chatOverlayOpen}>
                <summary>الصوت والألعاب</summary>
                <button className="v-button v-outline" onClick={openAudioSettings}>
                  <Headphones size={16} />
                  أجهزة الصوت والاتصال
                </button>
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
              </details>
              {room.active && (
                <div
                  ref={controlsRef}
                  className={`v-room-controls ${roomStyles.controls}`}
                  inert={chatOverlayOpen}
                >
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
                      disabled={!onSeat || me?.moderatorMuted || muteBusy}
                      aria-pressed={Boolean(me?.muted)}
                      aria-label={
                        onSeat
                          ? me?.muted
                            ? 'تشغيل الميكروفون'
                            : 'كتم الميكروفون'
                          : 'الميكروفون مكتوم'
                      }
                      onClick={() => void act({ type: 'mute', muted: !me?.muted })}
                    >
                      {!onSeat || me?.muted || me?.moderatorMuted ? <MicOff /> : <Mic />}
                      <span>
                        {onSeat ? (me?.muted ? 'تشغيل المايك' : 'كتم المايك') : 'المايك مكتوم'}
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
                      className="v-control v-gift-control"
                      disabled={!me || !room.chatEnabled}
                      onClick={() => openGifts()}
                    >
                      <Gift />
                      <span>الهدايا</span>
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
                  <button
                    className="v-leave"
                    aria-label="مغادرة الغرفة"
                    disabled={actionBusy}
                    onClick={() => void leave()}
                  >
                    <LogOut size={18} />
                    <span>مغادرة</span>
                  </button>
                </div>
              )}
              <Dialog
                open={membersOpen}
                onOpenChange={setMembersOpen}
                title="أهل المجلس"
                className="v-dialog v-members-dialog"
              >
                {' '}
                <section className="v-listeners" aria-label="أعضاء الغرفة">
                  <header>
                    <div className={roomStyles.membersHeading}>
                      <h2>
                        <Users size={19} />
                        أعضاء الغرفة <span>{number(participants.length)}</span>
                      </h2>
                      <p>
                        {number(room.listenerCount)} مستمع ·{' '}
                        {number(participants.filter((p) => p.seatIndex !== null).length)} على المايك
                      </p>
                    </div>
                    <label className="v-search">
                      <Search size={16} />
                      <input
                        type="search"
                        aria-label="البحث في أعضاء الغرفة"
                        placeholder="ابحث عن اسم…"
                        value={participantSearch}
                        onChange={(e) => setParticipantSearch(e.target.value)}
                      />
                    </label>
                  </header>
                  <div className="v-listener-grid">
                    {members.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setProfileId(p.id)}
                        aria-label={`ملف ${p.name}، ${roleLabels[p.role]}`}
                      >
                        <span>
                          <Avatar user={p} size={43} />
                          {p.handRaised && <Hand className="v-listener-hand" size={15} />}
                        </span>
                        <span className={roomStyles.memberInfo}>
                          <strong title={p.name}>
                            <MemberName
                              name={p.id === user.id ? 'أنت' : p.name}
                              badges={p.accountBadges}
                            />
                          </strong>
                          <small>
                            {p.seatIndex !== null ? <Mic size={12} /> : <Headphones size={12} />}
                            {p.handRaised
                              ? 'رفع يده'
                              : p.seatIndex !== null
                                ? roleLabels[p.role]
                                : 'مستمع'}
                          </small>
                        </span>
                      </button>
                    ))}
                    {!members.length && (
                      <p className="v-muted">
                        {participantSearch
                          ? 'لا يوجد اسم يطابق البحث.'
                          : 'سيظهر الأعضاء هنا عند الانضمام.'}
                      </p>
                    )}
                  </div>
                </section>
              </Dialog>
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
                      <h3>
                        <MemberName name={selected.name} badges={selected.accountBadges} />
                      </h3>
                      <p>
                        {roleLabels[selected.role]}
                        {selected.moderatorMuted ? ' · الميكروفون مكتوم من المشرف' : ''}
                      </p>
                    </div>
                    <button
                      className="v-button"
                      disabled={!me || !room.chatEnabled || !room.active}
                      onClick={() => openGifts(selected.id)}
                    >
                      <Gift size={18} /> إرسال هدية تجريبية
                    </button>
                    {selected.id !== user.id && (
                      <>
                        {relationship?.peerId === selected.id && (
                          <p className="v-friend-status">
                            <UserCheck size={17} />
                            {relationship.friend
                              ? 'صديق · تتابعان بعضكما'
                              : relationship.followsYou
                                ? 'يتابعك'
                                : 'المتابعة المتبادلة تجعلكما أصدقاء'}
                          </p>
                        )}
                        <div className="v-profile-actions">
                          <button
                            className="v-button"
                            onClick={() => {
                              setSocialOpen(true);
                              setPrivatePeer(selected.id);
                              setProfileId(null);
                            }}
                          >
                            <MessageCircle size={17} /> رسالة خاصة
                          </button>
                          <button
                            className="v-button"
                            disabled={followingBusy === selected.id}
                            aria-pressed={preferences.following.includes(selected.id)}
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
                      </>
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
              {giftsOpen && (
                <VoiceGifts
                  participants={participants}
                  selfId={user.id}
                  initialRecipientId={giftRecipient}
                  enabled={Boolean(me && room.active && room.chatEnabled)}
                  onEvent={event}
                  onClose={closeGifts}
                />
              )}
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
    </div>
  );
}
