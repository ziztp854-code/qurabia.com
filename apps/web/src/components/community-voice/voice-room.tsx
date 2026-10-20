'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Headphones,
  LogOut,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import type { VoiceMember } from '@/lib/community-voice/contracts';
import { VOICE_REACTIONS, VOICE_SEAT_LIMIT } from '@/lib/community-voice/contracts';
import { RealBadgeArtwork, RealFrameArtwork } from '@/components/community/realistic-art';
import { Button, Dialog } from '@/components/ui';
import { useVoiceRoom } from './use-voice-room';
import { EntranceOverlay } from './entrance-effect';
import styles from './voice.module.css';

type Controller = ReturnType<typeof useVoiceRoom>;
const ROLE_LABELS = { HOST: 'صاحب المجلس', MODERATOR: 'مشرف المجلس', MEMBER: 'مشارك' };

function MemberAvatar({ member, speaking = false }: { member: VoiceMember; speaking?: boolean }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  return (
    <span
      className={styles.avatar}
      data-speaking={speaking || undefined}
      data-tier={member.identity.frame?.tier ?? 'ordinary'}
    >
      {member.identity.avatarUrl && member.identity.avatarUrl !== failedPhoto ? (
        <Image
          className={styles.avatarPhoto}
          src={member.identity.avatarUrl}
          alt=""
          width={64}
          height={64}
          unoptimized
          onError={() => setFailedPhoto(member.identity.avatarUrl)}
        />
      ) : (
        <span className={styles.avatarEmpty}>لم تُضف صورة</span>
      )}
      {member.identity.frame && (
        <span className={styles.frameArt} aria-hidden="true">
          <RealFrameArtwork
            tier={member.identity.frame.tier}
            assetUrl={member.identity.frame.assetUrl}
            name={member.identity.frame.name}
          />
        </span>
      )}
      {member.identity.primaryBadge && (
        <span className={styles.avatarBadge}>
          <RealBadgeArtwork
            badgeId={member.identity.primaryBadge.id}
            assetUrl={member.identity.primaryBadge.assetUrl}
            name={member.identity.primaryBadge.name}
          />
        </span>
      )}
    </span>
  );
}

function RemoteAudio({
  stream,
  silent,
  onBlocked,
}: {
  stream: MediaStream;
  silent: boolean;
  onBlocked: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(onBlocked);
    return () => {
      element.pause();
      element.srcObject = null;
    };
  }, [stream, onBlocked]);
  return (
    <audio ref={ref} autoPlay playsInline muted={silent} data-voice-audio aria-hidden="true" />
  );
}

export function VoiceRoom({ roomId }: { roomId: string }) {
  const controller = useVoiceRoom(roomId);
  return <VoiceRoomView controller={controller} />;
}

/** Production presentation is separately exportable for isolated visual verification. */
export function VoiceRoomView({ controller }: { controller: Controller }) {
  const {
    room,
    status,
    error,
    command,
    speaking,
    microphoneActive,
    toggleMicrophone,
    leave,
    remoteStreams,
    effectsEnabled,
    toggleEffects,
    subduedEffects,
    announcement,
  } = controller;
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<VoiceMember | null>(null);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const chatMessages = useRef<HTMLDivElement>(null);
  const self = room?.members.find((member) => member.id === room.selfMemberId);
  const selectedCurrent = room?.members.find((member) => member.id === selected?.id) ?? selected;
  const selectedAccount = selectedCurrent?.identity.accountNumber;
  const selectedId = selectedCurrent?.id;
  const connected = status === 'connected' && room?.status === 'OPEN';
  const seatFree = room
    ? Array.from({ length: VOICE_SEAT_LIMIT }, (_, index) => index).find(
        (seat) => !room.members.some((member) => member.seat === seat),
      )
    : undefined;
  const blocked = useCallback(() => setPlaybackBlocked(true), []);

  useEffect(() => {
    const container = chatMessages.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [room?.messages.length]);
  useEffect(() => {
    if (selectedAccount === undefined || selectedId === self?.id) return;
    const abort = new AbortController();
    void fetch(`/api/community/profiles/${selectedAccount}`, { signal: abort.signal })
      .then((response) => response.json())
      .then((result) => {
        if (!abort.signal.aborted && result.ok && result.data)
          setFollowing(result.data.isFollowing);
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [selectedAccount, selectedId, self?.id]);

  const sendChat = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    const result = await command({ type: 'chat', text: text.trim() });
    if (result) setText('');
    setBusy(false);
  };
  const doFollow = async () => {
    if (!selectedCurrent || followBusy) return;
    setFollowBusy(true);
    try {
      const response = await fetch(
        `/api/community/profiles/${selectedCurrent.identity.accountNumber}/follow`,
        { method: following ? 'DELETE' : 'POST' },
      );
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'تعذّرت المتابعة.');
      setFollowing(Boolean(result.data?.isFollowing));
    } catch (reason) {
      controller.setError(reason instanceof Error ? reason.message : 'تعذّرت المتابعة.');
    } finally {
      setFollowBusy(false);
    }
  };
  const enablePlayback = async () => {
    await controller.resumePlayback();
    const results = await Promise.allSettled(
      [...document.querySelectorAll<HTMLAudioElement>('audio[data-voice-audio]')].map((element) =>
        element.play(),
      ),
    );
    setPlaybackBlocked(results.some((result) => result.status === 'rejected'));
  };

  if (!room)
    return (
      <div className={styles.voice}>
        <Link href="/community-voice" className={styles.backLink}>
          العودة إلى المجالس
        </Link>
        <section className={styles.empty}>
          <h1>{status === 'left' ? 'تعذّر دخول المجلس' : 'نجهّز مجلسك…'}</h1>
          <p role={error ? 'alert' : 'status'}>{error || 'جارٍ تأكيد الهوية والاتصال بالغرفة.'}</p>
          {error && (
            <Button variant="outline" onClick={() => window.location.reload()}>
              إعادة المحاولة
            </Button>
          )}
        </section>
      </div>
    );

  return (
    <div className={styles.voice}>
      <div className={styles.topline}>
        <Link href="/community-voice" className={styles.backLink}>
          تحدّي لايف / المجالس
        </Link>
        <span className={styles.connection} data-connected={connected}>
          <i />
          {status === 'connected'
            ? 'متصل بالمجلس'
            : status === 'left'
              ? 'غادرت المجلس'
              : 'نعيد الاتصال…'}
        </span>
      </div>
      <header className={styles.roomHeader}>
        <span className={styles.roomLogo} aria-hidden="true">
          <Image
            src={room.imageUrl || '/community-assets/voice-majlis.webp'}
            alt=""
            width={80}
            height={80}
            unoptimized
          />
        </span>
        <div>
          <span className={styles.eyebrow}>مجلس صوتي مباشر</span>
          <h1>{room.name}</h1>
          <div className={styles.roomMeta}>
            <bdi dir="ltr">#{room.code}</bdi>
            <span>
              <Users size={15} /> {room.members.length} حاضر
            </span>
            <span>
              <Mic size={15} /> {room.members.filter((member) => member.seat !== null).length} / 6
              مقاعد
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void leave();
          }}
          disabled={status === 'left'}
        >
          <LogOut size={17} /> مغادرة
        </Button>
      </header>
      {error && (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button aria-label="إخفاء الرسالة" onClick={() => controller.setError('')}>
            <X size={18} />
          </button>
        </div>
      )}
      {status === 'left' && (
        <p className={styles.notice}>
          انتهى اتصالك بهذه الغرفة. <Link href="/community-voice">عد إلى المجالس</Link> أو{' '}
          <button onClick={() => window.location.reload()}>حاول الدخول مجددًا</button>.
        </p>
      )}
      <div className={styles.roomLayout}>
        <div className={styles.mainColumn}>
          <section className={styles.seatStage} aria-labelledby="voice-seat-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.eyebrow}>في صدر المجلس</span>
                <h2 id="voice-seat-title">الأصوات الحاضرة</h2>
              </div>
            </div>
            <div className={styles.seats}>
              {Array.from({ length: VOICE_SEAT_LIMIT }, (_, seat) => {
                const member = room.members.find((entry) => entry.seat === seat);
                return member ? (
                  <button
                    className={styles.seat}
                    key={seat}
                    onClick={() => {
                      setSelected(member);
                      setFollowing(null);
                    }}
                    aria-label={`عرض ملف ${member.identity.name}، ${ROLE_LABELS[member.role]}، ${member.muted ? 'الميكروفون مكتوم' : 'الميكروفون متاح'}`}
                  >
                    <MemberAvatar member={member} speaking={speaking[member.id]} />
                    <strong>{member.identity.name}</strong>
                    <small>{member.identity.primaryBadge?.name || ROLE_LABELS[member.role]}</small>
                    <span className={styles.micState} data-muted={member.muted}>
                      {member.muted ? <MicOff size={14} /> : <Mic size={14} />}
                      {member.muted ? 'مكتوم' : speaking[member.id] ? 'يتحدث الآن' : 'المايك متاح'}
                    </span>
                  </button>
                ) : (
                  <button
                    className={`${styles.seat} ${styles.emptySeat}`}
                    key={seat}
                    onClick={() => {
                      void command({ type: 'request-seat' });
                    }}
                    disabled={!connected || self?.seat !== null || self?.requestedSeat}
                    aria-label={`طلب المقعد الصوتي ${seat + 1}`}
                  >
                    <span className={styles.avatar}>
                      <Mic size={24} />
                    </span>
                    <strong>مقعد متاح</strong>
                    <small>اطلب المايك</small>
                  </button>
                );
              })}
            </div>
            <div className={styles.entranceRail}>
              <EntranceOverlay announcement={announcement} subdued={subduedEffects} />
            </div>
            <div className={styles.voiceControls}>
              <Button
                variant={microphoneActive ? 'destructive' : 'gold'}
                onClick={() => {
                  void toggleMicrophone();
                }}
                disabled={!connected || self?.seat === null || self?.mutedByModerator}
              >
                {microphoneActive ? <MicOff size={18} /> : <Mic size={18} />}
                {microphoneActive ? 'كتم الميكروفون' : 'تشغيل الميكروفون'}
              </Button>
              {self?.seat === null ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    void command({ type: 'request-seat' });
                  }}
                  disabled={!connected || self.requestedSeat}
                >
                  {self.requestedSeat ? 'طلبك لدى المضيف' : 'طلب الصعود'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    void command({ type: 'release-seat' });
                  }}
                  disabled={!connected}
                >
                  اترك المقعد
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  void enablePlayback();
                }}
              >
                <Volume2 size={18} />
                {playbackBlocked ? 'اضغط لتشغيل الصوت' : 'تشغيل الاستماع'}
              </Button>
            </div>
            <p className={styles.footnote}>
              {self?.mutedByModerator
                ? 'أوقف المشرف الميكروفون مؤقتًا.'
                : 'الميكروفون لا يعمل إلا باختيارك. الإضاءة حول الصورة تتبع الصوت الفعلي.'}
            </p>
          </section>
          <section className={styles.panel} aria-labelledby="voice-audience-title">
            <div className={styles.sectionHeading}>
              <h2 id="voice-audience-title">
                <Headphones size={19} /> أهل المجلس
              </h2>
              <span>{room.members.length} حاضر</span>
            </div>
            <div className={styles.audience}>
              {room.members.map((member) => (
                <button
                  key={member.id}
                  className={styles.audienceMember}
                  onClick={() => {
                    setSelected(member);
                    setFollowing(null);
                  }}
                >
                  <MemberAvatar member={member} speaking={speaking[member.id]} />
                  <span>
                    <strong>{member.identity.name}</strong>
                    <small>
                      {ROLE_LABELS[member.role]}
                      {member.requestedSeat ? ' · يطلب المايك' : ''}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
          {room.canModerate && (
            <section className={styles.panel} aria-labelledby="voice-management-title">
              <div className={styles.sectionHeading}>
                <h2 id="voice-management-title">
                  <ShieldCheck size={19} /> أدوات المجلس
                </h2>
                {self?.role === 'HOST' && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm('إغلاق المجلس وإنهاء الاتصال للجميع؟'))
                        void command({ type: 'close' });
                    }}
                    disabled={!connected}
                  >
                    إغلاق المجلس
                  </Button>
                )}
              </div>
              <div className={styles.requests}>
                {room.members
                  .filter((member) => member.requestedSeat)
                  .map((member) => (
                    <div key={member.id}>
                      <strong>{member.identity.name}</strong>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (seatFree !== undefined)
                            void command({
                              type: 'approve-seat',
                              memberId: member.id,
                              seat: seatFree,
                            });
                        }}
                        disabled={!connected || seatFree === undefined}
                      >
                        السماح بالمايك
                      </Button>
                    </div>
                  ))}
                {!room.members.some((member) => member.requestedSeat) && (
                  <p className={styles.footnote}>
                    لا توجد طلبات صعود معلّقة. اضغط صورة المشارك لإدارة وصوله.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
        <aside className={styles.chatPanel} aria-labelledby="voice-chat-title">
          <div className={styles.sectionHeading}>
            <h2 id="voice-chat-title">حديث المجلس</h2>
            <span className={styles.livePill}>مباشر</span>
          </div>
          <div
            className={styles.chatMessages}
            ref={chatMessages}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {room.messages.length === 0 && (
              <p className={styles.footnote}>قل مرحبًا؛ هنا تبدأ الحكاية.</p>
            )}
            {room.messages.map((message) => (
              <article key={message.id}>
                <strong>{message.name}</strong>
                <p>{message.text}</p>
                <time dateTime={new Date(message.at).toISOString()}>
                  {new Date(message.at).toLocaleTimeString('ar-SA', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </article>
            ))}
          </div>
          <div className={styles.reactions} aria-label="التفاعلات">
            {VOICE_REACTIONS.map((reaction) => (
              <button
                key={reaction}
                aria-label={`إرسال تفاعل ${reaction}`}
                disabled={!connected}
                onClick={() => {
                  void command({ type: 'reaction', reaction });
                }}
              >
                {reaction}
              </button>
            ))}
          </div>
          <div className={styles.reactionFeed} aria-live="polite">
            {room.reactions
              .filter((reaction) => room.serverTime - reaction.at < 5000)
              .slice(-3)
              .map((reaction) => (
                <span key={reaction.id}>
                  {room.members.find((member) => member.id === reaction.memberId)?.identity.name}:{' '}
                  {reaction.reaction}
                </span>
              ))}
          </div>
          <form className={styles.chatForm} onSubmit={sendChat}>
            <label className="sr-only" htmlFor="voice-chat-text">
              رسالتك للمجلس
            </label>
            <input
              id="voice-chat-text"
              placeholder="اكتب رسالة للمجلس…"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={500}
              disabled={!connected}
              required
            />
            <Button
              type="submit"
              variant="gold"
              disabled={!connected || !text.trim()}
              loading={busy}
              aria-label="إرسال الرسالة"
            >
              <Send size={19} />
            </Button>
          </form>
          <button
            className={styles.effectsToggle}
            aria-pressed={effectsEnabled}
            onClick={() => {
              void toggleEffects();
            }}
          >
            مؤثرات الدخول: {effectsEnabled ? 'مفعّلة' : 'متوقفة'}
          </button>
        </aside>
      </div>
      {Object.entries(remoteStreams).map(([id, stream]) => (
        <RemoteAudio
          key={id}
          stream={stream}
          silent={
            !room.members.some(
              (member) => member.id === id && member.seat !== null && !member.muted,
            )
          }
          onBlocked={blocked}
        />
      ))}
      <Dialog
        open={Boolean(selectedCurrent)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="بطاقة المشارك"
      >
        {selectedCurrent && (
          <div className={styles.memberCard}>
            <MemberAvatar member={selectedCurrent} speaking={speaking[selectedCurrent.id]} />
            <h2>{selectedCurrent.identity.name}</h2>
            <span>{ROLE_LABELS[selectedCurrent.role]}</span>
            <bdi dir="ltr">ID {selectedCurrent.identity.accountNumber}</bdi>
            <div className={styles.memberBadges}>
              {selectedCurrent.identity.badges.map((badge) => (
                <span key={badge.id} title={badge.description}>
                  <RealBadgeArtwork
                    badgeId={badge.id}
                    assetUrl={badge.assetUrl}
                    name={badge.name}
                  />
                  {badge.name}
                </span>
              ))}
            </div>
            <a
              className={styles.profileLink}
              href={`/people/${selectedCurrent.identity.accountNumber}`}
            >
              عرض الملف الشخصي
            </a>
            {selectedCurrent.id !== self?.id && (
              <Button
                variant="gold"
                onClick={() => {
                  void doFollow();
                }}
                loading={followBusy}
                disabled={following === null}
              >
                {following ? 'إلغاء المتابعة' : 'متابعة'}
              </Button>
            )}
            {room.canModerate &&
              selectedCurrent.id !== self?.id &&
              selectedCurrent.role !== 'HOST' && (
                <div className={styles.memberModeration}>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void command({
                        type: 'mute',
                        memberId: selectedCurrent.id,
                        muted: !selectedCurrent.mutedByModerator,
                      });
                    }}
                  >
                    {selectedCurrent.mutedByModerator ? 'السماح بالمايك' : 'كتم المشارك'}
                  </Button>
                  {self?.role === 'HOST' && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        void command({
                          type: 'moderator',
                          memberId: selectedCurrent.id,
                          enabled: selectedCurrent.role !== 'MODERATOR',
                        });
                      }}
                    >
                      {selectedCurrent.role === 'MODERATOR' ? 'إلغاء الإشراف' : 'تعيين مشرف'}
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => {
                      void command({ type: 'remove', memberId: selectedCurrent.id });
                      setSelected(null);
                    }}
                  >
                    إخراج
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      void command({ type: 'block', memberId: selectedCurrent.id });
                      setSelected(null);
                    }}
                  >
                    حظر من المجلس
                  </Button>
                </div>
              )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
