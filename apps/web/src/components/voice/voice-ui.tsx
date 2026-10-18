'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Bell,
  Crown,
  Headphones,
  Heart,
  History,
  Home,
  Menu,
  Mic,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '@/components/ui/overlay';
import type { VoiceIdentity, VoiceRoom } from '@/lib/voice/types';
import { number } from './voice-client';
import { useVoiceMediaQuery, useVoiceOverlay } from './use-voice-overlay';

export type VoiceView = 'explore' | 'mine' | 'favorites' | 'following' | 'history' | 'settings';
export function Avatar({
  user,
  size = 40,
  speaking = false,
}: {
  user: Pick<VoiceIdentity, 'name' | 'image'>;
  size?: number;
  speaking?: boolean;
}) {
  return (
    <span
      className={`v-avatar ${speaking ? 'v-speaking' : ''}`}
      style={{ width: size, height: size }}
    >
      {user.image ? (
        <Image src={user.image} alt="" width={size} height={size} unoptimized />
      ) : (
        <span aria-hidden="true">
          {user.name.trim().slice(0, 1) || <UserRound size={size / 2} />}
        </span>
      )}
    </span>
  );
}
export function LiveBadge({
  active = true,
  waiting = false,
}: {
  active?: boolean;
  waiting?: boolean;
}) {
  return (
    <span className={`v-live ${active && !waiting ? '' : 'v-live-off'}`}>
      <span />
      {!active ? 'انتهى البث' : waiting ? 'بانتظار المشاركين' : 'مباشر الآن'}
    </span>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="v-empty">
      <span className="v-empty-icon">
        <Headphones size={30} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function VoiceShell({
  children,
  user,
  view = 'explore',
  onView,
  onCreate,
  search,
  onSearch,
  room = false,
  liveFavorites = [],
  modalActive = false,
}: {
  children: ReactNode;
  user: VoiceIdentity | null;
  view?: VoiceView;
  onView?: (view: VoiceView) => void;
  onCreate?: () => void;
  search?: string;
  onSearch?: (search: string) => void;
  room?: boolean;
  modalActive?: boolean;
  liveFavorites?: { id: string; name: string }[];
}) {
  const [menu, setMenu] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  const narrowSidebar = useVoiceMediaQuery('(max-width: 760px)');
  useVoiceOverlay(menu && narrowSidebar, sidebarRef, closeMenu);
  const [notifications, setNotifications] = useState(false);
  const nav: { id: VoiceView; label: string; icon: typeof Mic }[] = [
    { id: 'explore', label: 'استكشاف الغرف', icon: Mic },
    { id: 'mine', label: 'غرفي', icon: Home },
    { id: 'favorites', label: 'الغرف المفضلة', icon: Heart },
    { id: 'following', label: 'أتابعهم', icon: Users },
    { id: 'history', label: 'سجل الزيارات', icon: History },
    { id: 'settings', label: 'إعدادات الصوت', icon: Settings2 },
  ];
  function navigate(id: VoiceView) {
    setMenu(false);
    if (onView) onView(id);
  }
  return (
    <div className={`v-app ${room ? 'v-room-app' : ''}`} dir="rtl">
      <a href="#voice-main" className="v-skip">
        انتقل إلى المحتوى
      </a>
      <header className="v-topbar" inert={modalActive || (menu && narrowSidebar)}>
        <button
          className="v-icon v-menu-toggle"
          onClick={() => setMenu(!menu)}
          aria-label={menu ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={menu}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <Link href="/voice" className="v-brand">
          <Crown aria-hidden="true" />
          <span>
            تحدي لايف<small dir="ltr">TAHADDI LIVE</small>
          </span>
        </Link>
        <nav className="v-topnav" aria-label="التنقل الرئيسي">
          <Link href="/">الرئيسية</Link>
          <Link href="/voice" aria-current="page">
            الغرف الصوتية
          </Link>
          <Link href="/games">المسابقات</Link>
          <Link href="/leaderboard">المجتمع</Link>
        </nav>
        {onSearch && (
          <label className="v-search v-top-search">
            <Search size={18} />
            <input
              type="search"
              aria-label="ابحث عن غرفة أو مضيف"
              placeholder="ابحث عن غرفة أو مضيف…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
        )}
        <div className="v-header-actions">
          <button
            className="v-icon v-notification-button"
            aria-label={`الإشعارات${liveFavorites.length ? `، ${liveFavorites.length} غرف مفضلة مباشرة` : ''}`}
            onClick={() => {
              setMenu(false);
              setNotifications(true);
            }}
          >
            <Bell size={20} />
            {liveFavorites.length > 0 && (
              <span className="v-notification-count">{number(liveFavorites.length)}</span>
            )}
          </button>
          {user ? (
            <Link href="/profile" className="v-profile" aria-label={`الملف الشخصي: ${user.name}`}>
              <Avatar user={user} size={36} />
              <span>
                {user.name}
                <small>حساب تحدي</small>
              </span>
            </Link>
          ) : (
            <Link href="/auth/sign-in?next=%2Fvoice" className="v-button v-small">
              تسجيل الدخول
            </Link>
          )}
        </div>
      </header>
      {menu && (
        <button
          className="v-menu-scrim"
          aria-label="إغلاق القائمة"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="v-workspace">
        <aside
          inert={modalActive}
          ref={sidebarRef}
          className={`v-sidebar ${menu ? 'v-sidebar-open' : ''}`}
          role={menu && narrowSidebar ? 'dialog' : undefined}
          aria-modal={menu && narrowSidebar ? true : undefined}
          aria-label={menu && narrowSidebar ? 'قائمة الغرف الصوتية' : undefined}
          tabIndex={menu && narrowSidebar ? -1 : undefined}
        >
          <button
            className="v-icon v-sidebar-close"
            aria-label="إغلاق قائمة الغرف"
            onClick={closeMenu}
          >
            <X size={20} />
          </button>
          <p className="v-eyebrow">مساحتك الصوتية</p>
          {onCreate ? (
            <button
              className="v-button v-create"
              onClick={() => {
                setMenu(false);
                onCreate();
              }}
            >
              <Plus size={20} />
              إنشاء غرفة
            </button>
          ) : (
            <Link className="v-button v-create" href="/voice">
              <Mic size={20} />
              استكشاف الغرف
            </Link>
          )}
          <nav className="v-side-nav" aria-label="الغرف الصوتية">
            {nav.map((item) =>
              onView ? (
                <button
                  key={item.id}
                  className={view === item.id ? 'v-nav-active' : ''}
                  onClick={() => navigate(item.id)}
                  aria-current={view === item.id ? 'page' : undefined}
                >
                  <item.icon size={19} />
                  {item.label}
                </button>
              ) : (
                <Link key={item.id} href={`/voice?view=${item.id}`}>
                  <item.icon size={19} />
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <div className="v-sidebar-note">
            <ShieldCheck size={23} />
            <strong>صوت يجمعنا</strong>
            <p>احترام، خصوصية، ومساحة للجميع.</p>
            <Link href="/privacy">الخصوصية وقواعد المجتمع</Link>
          </div>
          <Link href="/" className="v-back-home">
            <Home size={16} />
            العودة إلى تحدي
          </Link>
        </aside>
        <main id="voice-main" className="v-main" inert={menu && narrowSidebar}>
          {children}
        </main>
      </div>
      {!room && (
        <nav inert={menu && narrowSidebar} className="v-bottomnav" aria-label="التنقل على الجوال">
          <Link href="/">
            <Home />
            <span>الرئيسية</span>
          </Link>
          <Link href="/games">
            <Trophy />
            <span>المسابقات</span>
          </Link>
          <button
            className={view === 'explore' ? 'is-active' : ''}
            onClick={() => navigate('explore')}
          >
            <Mic />
            <span>غرف صوتية</span>
          </button>
          <button onClick={() => navigate('following')}>
            <Users />
            <span>أتابعهم</span>
          </button>
          <Link href={user ? '/profile' : '/auth/sign-in?next=%2Fvoice'}>
            <UserRound />
            <span>حسابي</span>
          </Link>
        </nav>
      )}
      <Dialog
        open={notifications}
        onOpenChange={setNotifications}
        title="الإشعارات"
        className="v-dialog"
      >
        {liveFavorites.length ? (
          <div className="v-notification-list">
            <p>غرفك المفضلة المباشرة الآن</p>
            {liveFavorites.map((room) => (
              <Link key={room.id} href={`/voice/${room.id}`}>
                <LiveBadge />
                <strong>{room.name}</strong>
                <Headphones size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="لا توجد إشعارات جديدة">
            تظهر غرفك المفضلة هنا عندما تكون مباشرة، أثناء فتح صفحة الغرف.
          </EmptyState>
        )}
      </Dialog>
    </div>
  );
}
export function RoomCard({
  room,
  favorite,
  onFavorite,
  featured = false,
}: {
  room: VoiceRoom;
  favorite: boolean;
  onFavorite: () => void;
  featured?: boolean;
}) {
  return (
    <article className={`v-room-card ${featured ? 'v-room-featured' : ''}`}>
      <Link href={`/voice/${room.id}`} className="v-card-cover" aria-label={`دخول ${room.name}`}>
        <VoiceCover
          src={room.cover}
          sizes="(max-width: 600px) 92vw, (max-width: 1200px) 42vw, 25vw"
        />
        <LiveBadge active={room.active} waiting={room.participantCount === 0} />
        <span className="v-category-label">{room.category}</span>
      </Link>
      <div className="v-card-body">
        <div className="v-card-title">
          <h3>
            <Link href={`/voice/${room.id}`}>{room.name}</Link>
          </h3>
          <button
            className={`v-icon v-favorite ${favorite ? 'is-selected' : ''}`}
            onClick={onFavorite}
            aria-label={favorite ? `إزالة ${room.name} من المفضلة` : `إضافة ${room.name} للمفضلة`}
            aria-pressed={favorite}
          >
            <Heart size={20} />
          </button>
        </div>
        <p className="v-room-description">
          {room.description || 'مساحة للحوار واللقاءات الصوتية.'}
        </p>
        <div className="v-host-line">
          <Avatar user={{ name: room.hostName, image: room.hostImage }} size={27} />
          <span>{room.hostName}</span>
          <Crown size={13} />
        </div>
        <div className="v-card-presence">
          <span className="v-avatar-stack">
            {room.speakers.slice(0, 4).map((p) => (
              <Avatar key={p.id} user={p} size={27} />
            ))}
          </span>
          <span>
            <Headphones size={15} />
            {number(room.listenerCount)} مستمع
          </span>
        </div>
        <Link className="v-button v-enter" href={`/voice/${room.id}`}>
          دخول الغرفة
          <Headphones size={17} />
        </Link>
      </div>
    </article>
  );
}

export function VoiceCover({
  src,
  alt = '',
  sizes,
  priority = false,
}: {
  src: string;
  alt?: string;
  sizes: string;
  priority?: boolean;
}) {
  const preset = /^\/voice\/covers\/(studio|friends|coffee|gaming|oud|discussion|quiz)\.webp$/.test(
    src,
  );
  return (
    <picture>
      {preset && (
        <source media="(max-width: 600px)" srcSet={src.replace('.webp', '-mobile.webp')} />
      )}
      <Image src={src} alt={alt} fill sizes={sizes} priority={priority} unoptimized={!preset} />
    </picture>
  );
}
