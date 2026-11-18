import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import HomePage from './page';

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

describe('HomePage', () => {
  const renderHomePage = async () => render(<ThemeProvider>{await HomePage()}</ThemeProvider>);

  it('يعرض البطل الجديد ويحافظ على مسارَي اللعب والانضمام', async () => {
    await renderHomePage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('تحدي');
    expect(
      screen.getByText(
        'اختر تحدّيك، اجمع أصدقاءك، وشاركهم جولة تستحق المنافسة.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ابدأ اللعب الآن/ })).toHaveAttribute('href', '/games');
    expect(screen.getByRole('link', { name: /انضم برمز/ })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('textbox', { name: 'رمز الغرفة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انضم' })).toBeInTheDocument();
  });

  it('لا يعرض روابط تحدي لايف', async () => {
    const { container } = await renderHomePage();
    expect(container.querySelector('a[href^="/voice"]')).not.toBeInTheDocument();
  });

  it('يعرض رسومات الهبوط المنفصلة ويحافظ على الفيديو والدعوة دون رمز عددي', async () => {
    const { container } = await renderHomePage();
    const sources = [...container.querySelectorAll('[data-home-hero] img')].map((image) => {
      const src = image.getAttribute('src') ?? '';
      return new URL(src, 'http://localhost').searchParams.get('url') ?? src;
    });

    expect(sources).toEqual(
      expect.arrayContaining([
        '/home/studio-background-poster.webp',
        '/home/studio-trophy.webp',
        '/home/studio-lion.webp',
        '/home/studio-wordmark.webp',
        '/home/royal-hoo-qr.png',
      ]),
    );
    expect(sources.join(' ')).not.toContain('tahaddi-cinematic-stage.png');
    expect(container.querySelector('[data-layer="lion"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-layer="trophy"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-layer="crown"]')).not.toBeInTheDocument();

    const invite = screen.getByRole('complementary', { name: 'دعوة Hoo Live' });
    expect(within(invite).getByRole('img', { name: 'رمز QR لدعوة Hoo Live' })).toHaveAttribute(
      'src',
      '/home/royal-hoo-qr.png',
    );
    expect(within(invite).getByText('Hoo Live')).toBeInTheDocument();
    expect(within(invite).queryByRole('button')).not.toBeInTheDocument();

    const video = container.querySelector('[data-home-hero] video');
    expect(video).toHaveAttribute('src', '/home/studio-background-loop.mp4');
    expect(video).toHaveProperty('muted', true);
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('preload', 'none');
    fireEvent.click(screen.getByRole('button', { name: 'إيقاف حركة الخلفية' }));
    expect(screen.getByRole('button', { name: 'تشغيل حركة الخلفية' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('يعرض عالم المماليك بعد الألعاب ويجعل الرتب في قسم الاشتراكات', async () => {
    const { container } = await renderHomePage();
    const main = screen.getByRole('main');
    const sections = within(main).getAllByRole('region');
    expect(sections).toHaveLength(4);
    expect(sections.slice(0, 3).map((region) => region.getAttribute('aria-labelledby'))).toEqual([
      'landing-title',
      'featured-title',
      'mamluk-title',
    ]);
    expect(sections[3]).toHaveAccessibleName('استمر في التحدي');

    const showcase = container.querySelector('[data-home-showcase]');

    expect(showcase).toBeInTheDocument();
    expect(
      within(showcase as HTMLElement).queryByRole('region', { name: 'إحصاءات المنصة' }),
    ).not.toBeInTheDocument();
    expect(within(showcase as HTMLElement).queryByRole('region', { name: 'إهداء إلى أميرة' })).not.toBeInTheDocument();
    expect(within(showcase as HTMLElement).getByRole('region', { name: 'اختَر تحدّيك القادم' })).toBeInTheDocument();
    const world = screen.getByRole('region', { name: 'عالم المماليك' });
    expect(within(world).getByRole('link', { name: /ادخل عالم المماليك/ })).toHaveAttribute('href', '/games/kingdoms');
    expect(within(world).getByRole('link', { name: /استكشف خريطة العالم/ })).toHaveAttribute('href', '/games/kingdoms/world-map');
    expect(screen.queryByRole('region', { name: 'رُتب البلاط والاشتراكات' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /بطاقة رتبة/ })).not.toBeInTheDocument();
  });

  it('يعرض الألعاب المطلوبة ويحافظ على روابط الإنتاج المباشرة', async () => {
    await renderHomePage();

    const games = screen.getByRole('navigation', { name: 'ألعاب بارزة' });
    expect(within(games).getAllByRole('link', { name: /العب الآن/ })).toHaveLength(4);
    expect(within(games).getByText('تحدي الشطرنج')).toBeInTheDocument();
    expect(within(games).getByText('البلوت')).toBeInTheDocument();
    expect(games.querySelector('a[href="/questions"]')).not.toBeInTheDocument();

    const allGames = screen.getByRole('navigation', { name: 'روابط ألعاب الإنتاج' });
    for (const href of [
      '/games/knowledge-tower',
      '/games/chess',
      '/games/baloot',
      '/games/millionaire',
      '/mafia',
      '/games/category-board',
      '/games/letter-challenge',
    ]) {
      expect(allGames.querySelector(`a[href="${href}"]`)).toBeInTheDocument();
    }
  });

  it('يعرض نقاط القيمة ولا يكشف إحصاءات الحضور العامة', async () => {
    await renderHomePage();

    const trust = screen.getByRole('list', { name: 'مزايا المنصة' });
    expect(within(trust).getAllByRole('listitem')).toHaveLength(3);
    expect(within(trust).getByText('تحديات مباشرة')).toBeInTheDocument();
    expect(within(trust).getByText('منافسة حقيقية')).toBeInTheDocument();
    expect(within(trust).getByText('غرف خاصة')).toBeInTheDocument();

    expect(screen.queryByText('متواجد الآن')).not.toBeInTheDocument();
    expect(screen.queryByText('لاعب في غرفة حيّة')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'إحصاءات المنصة' })).not.toBeInTheDocument();
  });

  it('يوفر تنقل الجوال السفلي بالوجهات الحالية', async () => {
    await renderHomePage();

    const nav = screen.getByRole('navigation', { name: 'التنقل السفلي' });
    expect(within(nav).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'الألعاب' })).toHaveAttribute('href', '/games');
    expect(within(nav).getByRole('link', { name: 'المسابقات' })).toHaveAttribute('href', '/quizzes');
    expect(within(nav).getByRole('link', { name: 'لوحة الشرف' })).toHaveAttribute('href', '/leaderboard');
    expect(within(nav).getAllByRole('link')).toHaveLength(5);
    expect(within(nav).getByRole('link', { name: 'الحساب' })).toHaveAttribute('href', '/profile');
    expect(within(nav).queryByRole('link', { name: 'الاشتراكات' })).not.toBeInTheDocument();
  });
});
