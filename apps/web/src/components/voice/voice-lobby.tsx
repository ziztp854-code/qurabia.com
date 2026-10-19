'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AudioLines,
  ChevronLeft,
  Crown,
  Headphones,
  Heart,
  History,
  Mic,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
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
import {
  EmptyState,
  LiveBadge,
  RoomCard,
  VoiceShell,
  VoiceCover,
  type VoiceView,
} from './voice-ui';
import { coverPath, emptyPreferences, number, voiceRequest } from './voice-client';

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
  const [search, setSearch] = useState('');
  const [create, setCreate] = useState(false);
  const [data, setData] = useState<VoiceList | null>(null);
  const [preferences, setPreferences] = useState<VoicePreferences>(emptyPreferences);
  const [error, setError] = useState('');
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
    async function load() {
      try {
        const list = await voiceRequest<VoiceList>('rooms');
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
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل الغرف.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
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
  const filtered = useMemo(
    () =>
      (data?.rooms || []).filter(
        (room) =>
          (category === 'الكل' || room.category === category) &&
          (!search ||
            `${room.name} ${room.description} ${room.hostName}`
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (view !== 'mine' || room.hostId === user?.id) &&
          (view !== 'favorites' || preferences.favorites.includes(room.id)) &&
          (view !== 'following' || preferences.following.includes(room.hostId)),
      ),
    [data, category, search, view, user, preferences],
  );
  const active = [...filtered].sort((a, b) => b.participantCount - a.participantCount);
  const titles: Record<VoiceView, string> = {
    explore: 'اختر أجواءك.. وخلّ صوتك حاضر',
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
      {user && (
        <div className="v-profile-actions">
          <VoiceSocial user={user} preferences={preferences} onPreference={preference} />
        </div>
      )}
      {view === 'explore' && (
        <section className="v-hero" aria-labelledby="voice-hero-title">
          <VoiceCover
            src={coverPath('studio')}
            alt="ميكروفون وسماعات في استوديو بإضاءة ذهبية"
            priority
            sizes="(max-width: 800px) 100vw, 80vw"
          />
          <div className="v-hero-content">
            <span className="v-hero-kicker">
              <AudioLines size={17} />
              هنا، للصوت مساحة
            </span>
            <h1 id="voice-hero-title">
              غرف صوتية <span>حيّة.</span>
            </h1>
            <p>هويتنا عربية.. صوت يجمعنا</p>
            <div className="v-hero-buttons">
              <button className="v-button" onClick={createRoom}>
                <Plus size={19} />
                إنشاء غرفة
              </button>
              <a className="v-button v-outline" href="#rooms">
                استكشاف الغرف
                <ChevronLeft size={17} />
              </a>
            </div>
            <div className="v-hero-stats">
              <span>
                <Radio size={17} />
                <strong>{data ? number(data.stats.activeRooms) : '—'}</strong>غرف نشطة
              </span>
              <span>
                <Headphones size={17} />
                <strong>{data ? number(data.stats.listeners) : '—'}</strong>مستمع الآن
              </span>
            </div>
          </div>
          <div className="v-hero-seal">
            <Crown size={22} />
            <span>
              للحوار طابع آخر<small>TAHADDI LIVE</small>
            </span>
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
            <span className="v-room-count">{data ? number(filtered.length) : '—'} غرفة</span>
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
        {error && (
          <div className="v-error" role="alert">
            {error}
            <button className="v-text-button" onClick={() => setRefresh((n) => n + 1)}>
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
          <EmptyState title={user ? 'تعذر تحميل الغرف' : 'اللقاء يبدأ بحسابك'}>
            {user
              ? 'لم نتمكن من جلب الغرف الآن. أعد المحاولة بعد لحظات.'
              : 'سجّل الدخول لمشاهدة الغرف والانضمام إلى مجتمع تحدي لايف.'}
            {user ? (
              <button className="v-button" onClick={() => setRefresh((n) => n + 1)}>
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
              search || category !== 'الكل'
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
            {search || category !== 'الكل'
              ? 'جرّب تصنيفًا آخر أو ابحث باسم مختلف.'
              : 'أنشئ غرفة، شارك رابطها، وابدأ الحديث.'}
            <button className="v-button" onClick={createRoom}>
              <Plus size={18} />
              إنشاء غرفة
            </button>
          </EmptyState>
        ) : (
          <>
            {view === 'explore' && !search && category === 'الكل' && active.length > 0 && (
              <div className="v-featured-row">
                <div className="v-featured-label">
                  <span>
                    <AudioLines size={20} />
                    الأكثر نشاطًا الآن
                  </span>
                  <p>لقاءات حيّة تستحق الانضمام</p>
                </div>
                <div className="v-featured-room">
                  <VoiceCover src={active[0].cover} sizes="60vw" />
                  <div>
                    <LiveRoomInfo name={active[0].name} people={active[0].participantCount} />
                    <Link href={`/voice/${active[0].id}`} className="v-button">
                      انضم للغرفة
                      <Headphones size={18} />
                    </Link>
                  </div>
                </div>
              </div>
            )}
            <div className="v-grid-heading">
              <h3>
                <Sparkles size={18} />
                {view === 'explore' ? 'غرف مقترحة لك' : 'الغرف المباشرة'}
              </h3>
              <span>بترتيب النشاط الحالي</span>
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
      <CreateRoom open={create} onOpenChange={setCreate} />
    </VoiceShell>
  );
}
function LiveRoomInfo({ name, people }: { name: string; people: number }) {
  return (
    <div className="v-featured-copy">
      <LiveBadge waiting={people === 0} />
      <h3>{name}</h3>
      <p>
        <Users size={16} />
        {number(people)} حاضر
      </p>
    </div>
  );
}
