import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header, SiteLayout, DashboardLayout } from './site-shell';

const signOut = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/questions',
}));
vi.mock('next-auth/react', () => ({ signOut }));
vi.mock('../theme-toggle', () => ({
  ThemeToggle: () => <button type="button">المظهر</button>,
}));

describe('Header user menu', () => {
  beforeEach(() => signOut.mockReset());

  it('يعرض إجراءات الزائر مرة واحدة ويدير التركيز والإغلاق', async () => {
    const user = userEvent.setup();
    render(<Header />);
    const trigger = screen.getByRole('button', { name: 'قائمة المستخدم' });
    expect(trigger).toHaveClass('profile-menu-trigger');

    await user.click(trigger);
    const menuItems = screen.getAllByRole('menuitem');
    const menuLabels = menuItems.map((item: HTMLElement) => item.textContent);
    expect(menuLabels).toEqual(['تسجيل الدخول', 'إنشاء حساب']);
    expect(new Set(menuLabels).size).toBe(menuItems.length);
    expect(menuItems[0]).toHaveFocus();
    expect(screen.queryByRole('menuitem', { name: 'الملف الشخصي' })).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('يمرر مستخدم الجلسة ويعرض إجراءات الحساب دون إجراءات الزائر', async () => {
    const user = userEvent.setup();
    render(
      <SiteLayout user={{ name: 'سارة' }}>
        <p>المحتوى</p>
      </SiteLayout>,
    );

    const trigger = screen.getByRole('button', { name: 'قائمة المستخدم: سارة' });
    await user.click(trigger);

    expect(screen.getByText('سارة')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'الملف الشخصي' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.getByRole('menuitem', { name: 'لوحة التحكم' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.queryByRole('menuitem', { name: 'تسجيل الدخول' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'إنشاء حساب' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'تسجيل الخروج' }));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('يعرض علامة التوثيق للمدير الأساسي ولكل أدمن بجانب الاسم', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Header user={{ name: 'عبدالعزيز', role: 'OWNER' }} />);

    await user.click(screen.getByRole('button', { name: 'قائمة المستخدم: عبدالعزيز' }));
    expect(screen.getByLabelText('مدير موثّق')).toBeInTheDocument();

    rerender(<Header user={{ name: 'أحمد', role: 'ADMIN' }} />);
    expect(screen.getByLabelText('مدير موثّق')).toBeInTheDocument();
  });

  it('لا يعرض روابط الشاشات التدريبية في التنقل العام', () => {
    render(
      <SiteLayout>
        <p>المحتوى</p>
      </SiteLayout>,
    );

    expect(screen.queryByText('الشاشات التجريبية')).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="/demo/"]')).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'انضم إلى مسابقة' })) {
      expect(link).toHaveAttribute('href', '/join');
    }
  });

  it('يعرض تنقل الصفحة الرئيسية وإجراءاتها في نسختَي سطح المكتب والجوال', async () => {
    const user = userEvent.setup();
    render(
      <SiteLayout variant="home">
        <p>المحتوى</p>
      </SiteLayout>,
    );

    const desktopNavigation = screen.getByRole('navigation', { name: 'التنقل الرئيسي' });
    expect(within(desktopNavigation).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(desktopNavigation).getByRole('link', { name: 'الألعاب' })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(within(desktopNavigation).getByRole('link', { name: 'الدعم' })).toHaveAttribute(
      'href',
      '/contact',
    );
    expect(within(desktopNavigation).getByRole('link', { name: 'لوحة الشرف' })).toHaveAttribute(
      'href',
      '/leaderboard',
    );
    expect(within(desktopNavigation).getByRole('link', { name: 'المسابقات' })).toHaveAttribute(
      'href',
      '/quizzes',
    );
    expect(within(desktopNavigation).getByRole('link', { name: 'الحساب' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'تسجيل الدخول' }),
    ).toHaveAttribute('href', '/auth/sign-in');
    const sidebar = screen.getByRole('navigation', { name: 'التنقل الجانبي' });
    expect(within(sidebar).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('href', '/');
    expect(within(sidebar).getByRole('link', { name: 'الحساب' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'المظهر' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'فتح القائمة' }));
    const mobileNavigation = screen.getByRole('navigation', { name: 'قائمة الجوال' });
    expect(within(mobileNavigation).getByRole('link', { name: 'الألعاب' })).toHaveAttribute(
      'href',
      '/games',
    );
    expect(within(mobileNavigation).getByRole('link', { name: 'الحساب' })).toHaveAttribute(
      'href',
      '/profile',
    );

    const footer = screen.getByRole('contentinfo');
    for (const href of ['/', '/games', '/quizzes', '/leaderboard', '/contact', '/profile']) {
      expect(footer.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
    }
    expect(footer.querySelector('a[href="/questions"]')).not.toBeInTheDocument();
  });
});

describe('DashboardLayout sidebar', () => {
  it('marks بنك الأسئلة as the current page and keeps the collapse control in the brand row', () => {
    render(
      <DashboardLayout title="بنك الأسئلة المركزي" description="وصف البنك" actions={<a href="#question-editor">إضافة سؤال</a>}>
        <p>المحتوى</p>
      </DashboardLayout>,
    );

    const sidebar = screen.getByRole('navigation', { name: 'التنقل الجانبي' });
    expect(within(sidebar).getByRole('link', { name: 'بنك الأسئلة' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(sidebar).getByRole('link', { name: 'لوحة التحكم' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('button', { name: 'تصغير الشريط الجانبي' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'بنك الأسئلة المركزي', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('وصف البنك')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'إضافة سؤال' })).toHaveAttribute('href', '#question-editor');
    const crumbs = screen.getByRole('navigation', { name: 'مسار التنقل' });
    expect(within(crumbs).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('href', '/');
    expect(within(crumbs).getByRole('link', { name: 'لوحة التحكم' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('يفصل عنوان الصفحة عن آخر عنصر في مسار التنقل عند تمرير breadcrumbLabel', () => {
    render(
      <DashboardLayout title="صاحب المنصة" breadcrumbLabel="الملف الشخصي">
        <p>المحتوى</p>
      </DashboardLayout>,
    );

    expect(screen.getByRole('heading', { name: 'صاحب المنصة', level: 1 })).toBeInTheDocument();
    const crumbs = screen.getByRole('navigation', { name: 'مسار التنقل' });
    expect(within(crumbs).getByText('الملف الشخصي')).toBeInTheDocument();
    expect(within(crumbs).queryByText('صاحب المنصة')).not.toBeInTheDocument();
  });
});
