'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AudioLines,
  ChevronLeft,
  Heart,
  History,
  Mic,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  VoiceIdentity,
  VoiceList,
  VoicePreferences,
  VoicePreferencesAction,
} from '@/lib/voice/types';
import { VOICE_CATEGORIES } from '@/lib/voice/types';
import { Switch } from '@/components/ui/forms';
import { CreateRoom } from './create-room';
import { VoiceSocial } from './voice-social';
import { EmptyState, RoomCard, VoiceShell, type VoiceView } from './voice-ui';
import { emptyPreferences, number, voiceRequest, VoiceRequestError } from './voice-client';
import styles from './voice-lobby.module.css';

export function VoiceLobby({
  user,
  initialView = 'explore',
}: {
  user: VoiceIdentity | null;
  initialView?: VoiceView;
}) {
  const router = useRouter();
  const [view, setView] = useState<VoiceView>(initialView);
  const [category, setCategory] = useState('الكل');
  const [order, setOrder] = useState<'live' | 'popular' | 'new'>('live');
  const [search, setSearch] = useState('');
  const [create, setCreate] = useState(false);
  const [data, setData] = useState<VoiceList | null>(null);
  const [preferences, setPreferences] = useState<VoicePreferences>(emptyPreferences);
  const [error, setError] = useState('');
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [favoriteNotice, setFavoriteNotice] = useState('');
  const knownActiveRooms = useRef<Set<string> | null>(null);
  const preferencesRef = useRef(preferences);
  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const list = await voiceRequest<VoiceList>('rooms', undefined, 'GET', {
          signal: controller.signal,
        });
        if (!cancelled) {
          const active = new Set(
            list.rooms.filter((r) => r.active && r.participantCount > 0).map((r) => r.id),
          );
          const prefs = preferencesRef.current;
          if (knownActiveRooms.current && prefs.notifyFavorites) {
            const started = list.rooms.find(
              (r) =>
                r.active &&
                r.participantCount > 0 &&
                !knownActiveRooms.current?.has(r.id) &&
                prefs.favorites.includes(r.id),
            );
            if (started) setFavoriteNotice(`غرفتك المفضلة «${started.name}» مباشرة الآن.`);
          }
          knownActiveRooms.current = active;
          setData(list);
          setRequiresSignIn(false);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setRequiresSignIn(err instanceof VoiceRequestError && err.status === 401);
          setError(err instanceof Error ? err.message : 'تعذر تحميل الغرف.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [refresh]);
  useEffect(() => {
    let cancelled = false;
    if (user)
      void voiceRequest<VoicePreferences>('preferences')
        .then((p) => {
          if (!cancelled) setPreferences(p);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);
  function createRoom() {
    if (user) setCreate(true);
    else router.push('/auth/sign-in?next=%2Fvoice');
  }
  async function preference(action: VoicePreferencesAction) {
    if (!user) {
      router.push('/auth/sign-in?next=%2Fvoice');
      return;
    }
    try {
      setPreferences(await voiceRequest<VoicePreferences>('preferences', action, 'PATCH'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التفضيل.');
    }
  }
  function retryRooms() {
    setLoading(true);
    setError('');
    setRefresh((n) => n + 1);
  }
  function clearFilters() {
    setSearch('');
    setCategory('الكل');
  }
  const query = search.trim().toLocaleLowerCase('ar');
  const filtered = useMemo(
    () =>
      (data?.rooms || []).filter(
        (room) =>
          (category === 'الكل' || room.category === category) &&
          (!query ||
            `${room.name} ${room.description} ${room.hostName}`
              .toLocaleLowerCase('ar')
              .includes(query)) &&
          (view !== 'mine' || room.hostId === user?.id) &&
          (view !== 'favorites' || preferences.favorites.includes(room.id)) &&
          (view !== 'following' || preferences.following.includes(room.hostId)),
      ),
    [data, category, query, view, user, preferences],
  );
  const active = [...filtered].sort((a, b) =>
    order === 'new'
      ? b.createdAt - a.createdAt
      : order === 'popular'
        ? b.participantCount - a.participantCount
        : Number(b.active) - Number(a.active) || b.participantCount - a.participantCount,
  );
  const featured = filtered
    .filter((room) => room.active && room.participantCount > 0)
    .sort((a, b) => b.participantCount - a.participantCount)[0];
  const liveCount = data?.rooms.filter((room) => room.active && room.participantCount > 0).length;
  const hasFilters = Boolean(query || category !== 'الكل');
  const titles: Record<VoiceView, string> = {
    explore: 'اكتشف البثوث',
    mine: 'غرفك، بطابعك',
    favorites: 'غرف قريبة لقلبك',
    following: 'أصوات تتابعها',
    history: 'آخر لقاءاتك',
    settings: 'إعداداتك وخصوصيتك',
  };
  return (
    <VoiceShell
      user={user}
      view={view}
      onView={setView}
      onCreate={createRoom}
      search={search}
      onSearch={setSearch}
      liveFavorites={
        preferences.notifyFavorites
          ? (data?.rooms || []).filter(
              (r) => r.active && r.participantCount > 0 && preferences.favorites.includes(r.id),
            )
          : []
      }
    >
      <div className={styles.discovery}>
        {view === 'explore' && (
          <nav className={styles.tabs} aria-label="ترتيب الغرف">
            {(
              [
                ['live', 'مباشر'],
                ['popular', 'الأكثر شعبية'],
                ['new', 'جديد'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} aria-pressed={order === id} onClick={() => setOrder(id)}>
                {label}
              </button>
            ))}
          </nav>
        )}
        {user && (
          <div className="v-profile-actions">
            <VoiceSocial user={user} preferences={preferences} onPreference={preference} />
          </div>
        )}
        {view === 'explore' && (
          <section className={styles.invitation} aria-labelledby="voice-hero-title">
            <div className={styles.invitationCopy}>
              <span className={styles.kicker}>
                <AudioLines size={16} aria-hidden="true" /> تحدي لايف
              </span>
              <h1 id="voice-hero-title">للّقاء طابع آخر</h1>
              <p>اختر مجلسك، استمع للحوار، وشارك بصوتك.</p>
              <button className="v-button" onClick={createRoom}>
                أنشئ غرفتك <Plus size={16} />
              </button>
            </div>
            <div className={styles.onAir}>
              <AudioLines size={48} strokeWidth={1.25} aria-hidden="true" />
              <span>
                {liveCount === undefined
                  ? error
                    ? 'تعذر تحديث الغرف'
                    : 'نستكشف اللقاءات…'
                  : liveCount
                    ? `${number(liveCount)} غرف حيّة الآن`
                    : 'كن أول من يبدأ اللقاء'}
              </span>
              <small>مجالس عربية، وأصوات تجمعنا</small>
            </div>
          </section>
        )}
        {favoriteNotice && (
          <p className="v-favorite-notice" role="status">
            <Radio size={17} />
            {favoriteNotice}
            <button className="v-text-button" onClick={() => setFavoriteNotice('')}>
              إغلاق
            </button>
          </p>
        )}
        <section id="rooms" className="v-discovery">
          <div className="v-section-heading">
            <div>
              <p className="v-eyebrow">{view === 'explore' ? 'على موجتك' : 'مساحتك الصوتية'}</p>
              <h2>{titles[view]}</h2>
            </div>
            {view !== 'settings' && view !== 'history' && (
              <span className="v-room-count" role="status" aria-live="polite">
                {data ? number(filtered.length) : '—'} غرفة
              </span>
            )}
          </div>
          {view !== 'settings' && view !== 'history' && (
            <>
              <label className="v-search v-mobile-search">
                <Search size={18} />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث عن غرفة أو مضيف…"
                  aria-label="ابحث عن غرفة أو مضيف"
                />
              </label>
              <div className="v-categories" role="group" aria-label="تصنيفات الغرف">
                {['الكل', ...VOICE_CATEGORIES].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    aria-pressed={category === c}
                    className={category === c ? 'is-selected' : ''}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          )}
          {error && data && (
            <div className="v-error" role="alert">
              {error}
              <button className="v-text-button" onClick={retryRooms} disabled={loading}>
                إعادة المحاولة
              </button>
            </div>
          )}
          {view === 'settings' ? (
            <section className="v-settings-panel">
              <ShieldCheck size={28} />
              <h3>أنت تتحكم بتجربتك</h3>
              <p>
                اختيار الميكروفون والسماعات ومستوى الاستماع متاح داخل الغرفة، بعد السماح بالوصول إلى
                أجهزة الصوت.
              </p>
              {user ? (
                <>
                  <Switch
                    label="إشعارات الغرف المفضلة أثناء فتح هذه الصفحة"
                    checked={preferences.notifyFavorites}
                    onChange={(checked) =>
                      void preference({ type: 'privacy', notifyFavorites: checked })
                    }
                  />
                  <Link href="/profile" className="v-button v-outline">
                    إدارة حسابي
                  </Link>
                </>
              ) : (
                <Link className="v-button" href="/auth/sign-in?next=%2Fvoice">
                  سجّل الدخول لحفظ تفضيلاتك
                </Link>
              )}
              <p className="v-muted">لا نسجّل محادثاتك الصوتية.</p>
            </section>
          ) : view === 'history' ? (
            preferences.history.length ? (
              <div className="v-history-list">
                {preferences.history.map((h) => (
                  <Link key={`${h.roomId}-${h.visitedAt}`} href={`/voice/${h.roomId}`}>
                    <History />
                    <span>
                      <strong>{h.name}</strong>
                      <small>
                        {new Date(h.visitedAt).toLocaleString('ar-SA', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </small>
                    </span>
                    <ChevronLeft />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="لقاءاتك القادمة تبدأ من هنا">
                عندما تدخل غرفة، ستجدها في سجل الزيارات.
                <button className="v-text-button" onClick={() => setView('explore')}>
                  استكشاف الغرف
                </button>
              </EmptyState>
            )
          ) : loading ? (
            <div className="v-loading" role="status">
              <AudioLines />
              نبحث عن الأصوات الحاضرة…
            </div>
          ) : !data ? (
            <EmptyState title={requiresSignIn ? 'اللقاء يبدأ بحسابك' : 'تعذر تحميل الغرف'}>
              {!requiresSignIn
                ? 'لم نتمكن من جلب الغرف الآن. أعد المحاولة بعد لحظات.'
                : 'سجّل الدخول لمشاهدة الغرف والانضمام إلى مجتمع تحدي لايف.'}
              {!requiresSignIn ? (
                <button className="v-button" onClick={retryRooms} disabled={loading}>
                  إعادة المحاولة
                </button>
              ) : (
                <Link className="v-button" href="/auth/sign-in?next=%2Fvoice">
                  تسجيل الدخول
                </Link>
              )}
            </EmptyState>
          ) : !filtered.length ? (
            <EmptyState
              title={
                hasFilters
                  ? 'لا توجد غرف تطابق بحثك'
                  : view === 'mine'
                    ? 'مساحتك الأولى بانتظارك'
                    : view === 'favorites'
                      ? 'لم تضف غرفة إلى المفضلة بعد'
                      : view === 'following'
                        ? 'تابع المضيفين من داخل غرفهم'
                        : 'المجلس ينتظر أول صوت'
              }
            >
              {hasFilters
                ? 'جرّب تصنيفًا آخر أو ابحث باسم مختلف.'
                : 'أنشئ غرفة، شارك رابطها، وابدأ الحديث.'}
              {hasFilters ? (
                <button className="v-button" onClick={clearFilters}>
                  مسح البحث والتصنيف
                </button>
              ) : (
                <button className="v-button" onClick={createRoom}>
                  <Plus size={18} />
                  إنشاء غرفة
                </button>
              )}
            </EmptyState>
          ) : (
            <>
              {view === 'explore' && !hasFilters && featured && (
                <aside className={styles.spotlight} aria-label="الغرفة الأكثر نشاطًا">
                  <div className={styles.spotlightLabel}>
                    <Radio size={20} aria-hidden="true" />
                    <span>الأكثر نشاطًا الآن</span>
                  </div>
                  <Link href={`/voice/${featured.id}`} className={styles.spotlightRoom}>
                    <strong>{featured.name}</strong>
                    <span>
                      <Users size={15} aria-hidden="true" /> {number(featured.participantCount)}{' '}
                      حاضر
                    </span>
                    <ChevronLeft size={18} aria-hidden="true" />
                  </Link>
                </aside>
              )}
              <div className="v-grid-heading">
                <h3>{hasFilters ? 'نتائج البحث' : view === 'explore' ? 'اختر مجلسك' : 'غرفك'}</h3>
                <span>
                  {order === 'new'
                    ? 'الأحدث أولًا'
                    : order === 'popular'
                      ? 'الأكثر حضورًا أولًا'
                      : 'المباشرة أولًا'}
                </span>
              </div>
              <div className="v-room-grid">
                {active.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    favorite={preferences.favorites.includes(room.id)}
                    onFavorite={() =>
                      void preference({
                        type: 'favorite',
                        id: room.id,
                        enabled: !preferences.favorites.includes(room.id),
                      })
                    }
                  />
                ))}
              </div>
            </>
          )}
        </section>
        <section className="v-value-strip">
          <span>
            <Mic />
            صوت بلا حواجز<small>استمع، شارك، وكن جزءًا من الحوار</small>
          </span>
          <span>
            <Heart />
            مجتمع يشبهك<small>مساحات متنوعة وشخصيات تجمعنا</small>
          </span>
          <span>
            <ShieldCheck />
            راحة وخصوصية<small>إشراف واضح، وتحكم في تجربتك</small>
          </span>
        </section>
      </div>
      <CreateRoom open={create} onOpenChange={setCreate} />
    </VoiceShell>
  );
}
