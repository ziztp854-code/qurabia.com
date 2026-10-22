'use client';

import {
  AtSign,
  Camera,
  ChevronLeft,
  ChevronRight,
  LogIn,
  Menu,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Play,
  UserCircle2,
  X,
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type AnchorHTMLAttributes,
} from 'react';
import { primaryNavigation, publicNavigation } from '@/config/navigation';
import { siteConfig } from '@/config/site';
import { cn } from '@/lib/utils';
import { BrandLogo, BrandMark } from '../brand';
import { ThemeToggle } from '../theme-toggle';
import { AdminVerifiedName, Button, ButtonLink, FloatingPanel } from '../ui';
import { SignOutButton } from '../auth/sign-out-button';

// Keep App Router navigation so the existing voice session survives page changes.
function NavigationLink({
  href,
  ...props
}: {
  href: string;
} & Pick<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'children' | 'className' | 'onClick' | 'aria-current' | 'aria-label'
>) {
  return <Link href={href} prefetch={false} {...props} />;
}

type HeaderVariant = 'default' | 'home';

export function Logo({ variant = 'default' }: { variant?: HeaderVariant }) {
  return (
    <Link
      className={cn('logo', variant === 'home' && 'home-logo')}
      href="/"
      prefetch={false}
      aria-label={`${siteConfig.name} — الصفحة الرئيسية`}
    >
      <BrandLogo variant="horizontal" tone="light" />
    </Link>
  );
}

export type HeaderUser = {
  name?: string | null;
  role?: string | null;
};

export function Header({
  user = null,
  variant = 'default',
}: {
  user?: HeaderUser | null;
  variant?: HeaderVariant;
}) {
  const pathname = usePathname();
  const activeHref = publicNavigation
    .filter((item) =>
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname?.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const [open, setOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const mobileMenuId = useId();
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const userMenuId = useId();
  const userMenuButtonId = useId();
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuButtonRef = useRef<HTMLButtonElement>(null);

  const closeUserMenu = useCallback(() => {
    setUserOpen(false);
    queueMicrotask(() => userMenuButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!userOpen) return;

    userMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeUserMenu();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      if (!userMenuRef.current?.contains(document.activeElement) && document.activeElement !== userMenuButtonRef.current) return;
      const items = [...(userMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled):not([aria-disabled="true"])') || [])];
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!userDropdownRef.current?.contains(event.target as Node)) {
        closeUserMenu();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [closeUserMenu, userOpen]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      mobileMenuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open]);

  const isHome = variant === 'home';

  return (
    <header className={cn('site-header', isHome && 'home-header')}>
      <div className="container header-inner">
        <Logo variant={variant} />
        <nav className="desktop-nav" aria-label="التنقل الرئيسي">
          {publicNavigation
            .filter(
              (item) => !['/games/kingdoms/world-map', '/contact', '/profile'].includes(item.href),
            )
            .map((item) => (
              <NavigationLink
                key={item.href}
                aria-label={item.label}
                href={item.href}

                aria-current={activeHref === item.href ? 'page' : undefined}
              >
                {isHome && <item.icon aria-hidden="true" />}
                {item.label}
              </NavigationLink>
            ))}
        </nav>
        <div className="header-actions">
          {!isHome && (
            <>
              <ButtonLink href="/join" variant="outline" className="hide-mobile">
                انضم إلى مسابقة
              </ButtonLink>
              <ButtonLink href="/quizzes/new" variant="primary" className="hide-tablet">
                أنشئ مسابقة
              </ButtonLink>
            </>
          )}
          <ThemeToggle />
          {isHome && !user ? (
            <ButtonLink href="/auth/sign-in" variant="outline" className="home-login-button">
              تسجيل الدخول
              <LogIn aria-hidden="true" />
            </ButtonLink>
          ) : (
            <div className="dropdown profile-menu" ref={userDropdownRef} onBlurCapture={(event) => {
              if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setUserOpen(false);
            }}>
              <Button
                ref={userMenuButtonRef}
                id={userMenuButtonId}
                variant="ghost"
                size="icon"
                className="profile-menu-trigger"
                aria-label={user ? `قائمة المستخدم: ${user.name || 'الحساب'}` : 'قائمة المستخدم'}
                aria-haspopup="menu"
                aria-expanded={userOpen}
                aria-controls={userOpen ? userMenuId : undefined}
                onClick={() => {
                  setOpen(false);
                  setUserOpen((current) => !current);
                }}
              >
                <UserCircle2 />
              </Button>
              <AnimatePresence>{userOpen && (
                <FloatingPanel
                  anchorRef={userMenuButtonRef}
                  id={userMenuId}
                  ref={userMenuRef}
                  role="menu"
                  aria-labelledby={userMenuButtonId}
                >
                  {user ? (
                    <>
                      {user.name && (
                        <AdminVerifiedName
                          isManager={user.role === 'OWNER' || user.role === 'ADMIN'}
                        >
                          {user.name}
                        </AdminVerifiedName>
                      )}
                      <Link
                        role="menuitem"
                        href="/profile"
                        prefetch={false}
                        onClick={closeUserMenu}
                      >
                        الملف الشخصي
                      </Link>
                      <Link
                        role="menuitem"
                        href="/dashboard"
                        prefetch={false}
                        onClick={closeUserMenu}
                      >
                        لوحة التحكم
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          closeUserMenu();
                          void signOut({ callbackUrl: '/' });
                        }}
                      >
                        تسجيل الخروج
                      </button>
                    </>
                  ) : (
                    <>
                      <Link
                        role="menuitem"
                        href="/auth/sign-in"
                        prefetch={false}
                        onClick={closeUserMenu}
                      >
                        تسجيل الدخول
                      </Link>
                      <Link
                        role="menuitem"
                        href="/auth/sign-up"
                        prefetch={false}
                        onClick={closeUserMenu}
                      >
                        إنشاء حساب
                      </Link>
                    </>
                  )}
                </FloatingPanel>
              )}</AnimatePresence>
            </div>
          )}
          <Button
            ref={mobileMenuButtonRef}
            aria-controls={open ? mobileMenuId : undefined}
            className="mobile-menu-button"
            variant="ghost"
            size="icon"
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={open}
            onClick={() => {
              if (userOpen) closeUserMenu();
              setOpen((current) => !current);
            }}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav id={mobileMenuId} className="mobile-nav" aria-label="قائمة الجوال">
          {publicNavigation.map((item) => (
            <NavigationLink
              key={item.href}
              aria-label={item.label}
              href={item.href}
              aria-current={activeHref === item.href ? 'page' : undefined}

              onClick={() => setOpen(false)}
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </NavigationLink>
          ))}
        </nav>
      )}
    </header>
  );
}

function HomeSidebar() {
  return (
    <aside className="home-sidebar" aria-label="الشريط الجانبي">
      <BrandMark title="تحدي" />
      <nav aria-label="التنقل الجانبي">
        {publicNavigation.map((item) => (
          <NavigationLink
            aria-label={item.label}
            href={item.href}
            key={item.href}

            className={item.href === '/' ? 'active' : undefined}
            aria-current={item.href === '/' ? 'page' : undefined}
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </NavigationLink>
        ))}
      </nav>
    </aside>
  );
}

export function PageBackButton({ className }: { className?: string }) {
  const handleBack = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign('/');
  }, []);

  return (
    <button type="button" className={cn('page-back-button', className)} onClick={handleBack}>
      <ChevronRight aria-hidden="true" />
      رجوع
    </button>
  );
}

export function Footer({ variant = 'default' }: { variant?: HeaderVariant }) {
  const isHome = variant === 'home';
  return (
    <footer className={cn('site-footer', variant === 'home' && 'home-footer')}>
      <div className="container footer-grid">
        <div>
          {isHome ? <BrandLogo variant="horizontal" tone="light" /> : <Logo />}
          <p>{siteConfig.description}</p>
          <div className="site-builder">
            <span>{isHome ? 'تم بناؤه وتصميمه بواسطة' : 'بُني وصُمم بعناية بواسطة'}</span>
            <strong>عبدالعزيز بن سلطان العتيبي</strong>
          </div>
          <small>© 2026 تحدّي. جميع الحقوق محفوظة.</small>
        </div>
        <div>
          <strong>استكشف</strong>
          {publicNavigation.map((item) => (
            <NavigationLink key={item.href} aria-label={item.label} href={item.href}>
              {item.label}
            </NavigationLink>
          ))}
        </div>
        <div>
          <strong>ابدأ</strong>
          <Link href="/join" prefetch={false}>
            انضم إلى مسابقة
          </Link>
          <Link href="/quizzes/new" prefetch={false}>
            أنشئ مسابقة
          </Link>
          <Link href="/dedication" prefetch={false}>
            الإهداء
          </Link>
        </div>
        {isHome && (
          <div className="home-footer-legal">
            <strong>روابط مهمة</strong>
            <Link href="/privacy" prefetch={false}>
              سياسة الخصوصية
            </Link>
            <Link href="/terms" prefetch={false}>
              شروط الاستخدام
            </Link>
            <Link href="/contact" prefetch={false}>
              تواصل معنا
            </Link>
            <div className="home-footer-socials" aria-label="الشبكات الاجتماعية">
              <a href="https://instagram.com" aria-label="إنستغرام">
                <Camera />
              </a>
              <a href="https://x.com" aria-label="إكس">
                <AtSign />
              </a>
              <a href="https://discord.com" aria-label="ديسكورد">
                <MessageCircle />
              </a>
              <a href="https://youtube.com" aria-label="يوتيوب">
                <Play />
              </a>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
export function SiteLayout({
  children,
  user = null,
  variant = 'default',
}: {
  children: ReactNode;
  user?: HeaderUser | null;
  variant?: HeaderVariant;
}) {
  return (
    <div className={cn('site-layout', variant === 'home' && 'home-site-layout')}>
      <a className="skip-link" href="#main-content">
        تجاوز إلى المحتوى
      </a>
      <Header user={user} variant={variant} />
      {variant === 'home' && <HomeSidebar />}
      {variant !== 'home' && (
        <div className="container page-backbar" aria-label="إجراء الرجوع">
          <PageBackButton />
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <Footer variant={variant} />
    </div>
  );
}

type BreadcrumbItem = string | { href: string; label: string };

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" aria-label="مسار التنقل">
      <Link href="/" prefetch={false}>
        الرئيسية
      </Link>
      {items.map((item) => {
        const label = typeof item === 'string' ? item : item.label;
        const href = typeof item === 'string' ? undefined : item.href;
        return (
          <span key={label}>
            <ChevronLeft aria-hidden="true" />
            {href ? (
              <Link href={href} prefetch={false}>
                {label}
              </Link>
            ) : (
              label
            )}
          </span>
        );
      })}
    </nav>
  );
}

export function DashboardLayout({
  children,
  title = 'لوحة التحكم',
  description,
  actions,
  breadcrumbLabel,
  className,
  sidebarProfile,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbLabel?: string;
  className?: string;
  sidebarProfile?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname() || '';
  const lastCrumb = breadcrumbLabel ?? title;
  const crumbs: BreadcrumbItem[] =
    lastCrumb === 'لوحة التحكم'
      ? [lastCrumb]
      : [{ href: '/dashboard', label: 'لوحة التحكم' }, lastCrumb];

  return (
    <div className={cn('dashboard-layout', collapsed && 'sidebar-collapsed', className)}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo />
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? 'توسيع الشريط الجانبي' : 'تصغير الشريط الجانبي'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <PanelRightOpen /> : <PanelRightClose />}
          </Button>
        </div>
        {sidebarProfile}
        <nav aria-label="التنقل الجانبي">
          {primaryNavigation.map((item) => {
            const isCurrent =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <NavigationLink
                aria-label={item.label}
                href={item.href}
                key={item.href}

                aria-current={isCurrent ? 'page' : undefined}
              >
                <item.icon aria-hidden="true" />
                <span>{item.label}</span>
              </NavigationLink>
            );
          })}
        </nav>
        <SignOutButton />
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <div className="dashboard-header-copy">
            <Breadcrumb items={crumbs} />
            <h1>{title}</h1>
            {description ? <p className="dashboard-header-lead">{description}</p> : null}
          </div>
          <div className="dashboard-header-actions">
            {actions}
            <PageBackButton />
            <ThemeToggle />
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export function HostLayout({ children, players = 0 }: { children: ReactNode; players?: number }) {
  return (
    <div className="host-layout">
      <header>
        <Logo />
        <div>
          <PageBackButton className="host-back-button" />
          <span>{players} مشارك في غرفك</span>
          <ButtonLink href="/profile" variant="ghost" size="icon" aria-label="الحساب">
            <UserCircle2 />
          </ButtonLink>
          <ThemeToggle />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
export function BroadcastLayout({ children }: { children: ReactNode }) {
  return <main className="broadcast-layout">{children}</main>;
}
