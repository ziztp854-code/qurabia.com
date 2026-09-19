import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import HomePage from './page';

vi.mock('@/components/motion/reveal', () => ({
  Reveal: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/components/home/landing-scene-3d', () => ({
  LandingScene3D: () => <div data-testid="landing-scene-3d" />,
}));

vi.mock('@/app/quizzes/actions', () => ({
  getPublicQuizzes: vi.fn().mockResolvedValue({ status: 'success', quizzes: [] }),
}));

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('HomePage', () => {
  const renderHomePage = async () => render(<ThemeProvider>{await HomePage()}</ThemeProvider>);

  it('يعرض البطل الجديد ويحافظ على مسارَي اللعب والانضمام', async () => {
    await renderHomePage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('تحدي');
    expect(
      screen.getByText(
        'منصة مسابقات وألعاب جماعية عربية مباشرة، حيث يُصنع الأبطال وتُسجّل إنجازاتهم',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ابدأ اللعب الآن/ })).toHaveAttribute('href', '/games');
    expect(screen.getByRole('link', { name: /انضم برمز/ })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('textbox', { name: 'رمز الغرفة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انضم' })).toBeInTheDocument();
  });

  it('يستخدم أصول Hero الرسمية المنفصلة دون الصورة المركبة القديمة', async () => {
    const { container } = await renderHomePage();
    const sources = [...container.querySelectorAll('[data-home-hero] img')].map((image) => {
      const src = image.getAttribute('src') ?? '';
      return new URL(src, 'http://localhost').searchParams.get('url') ?? src;
    });

    expect(sources).toEqual(expect.arrayContaining([
      '/home/tahaddi-hero-background-3344x1882.webp',
      '/home/tahaddi-trophy-ornate-transparent.png',
      '/home/tahaddi-lion-transparent-1322x1190.webp',
      '/home/tahaddi-crown-transparent-1024x683.webp',
    ]));
    expect(sources.join(' ')).not.toContain('tahaddi-cinematic-stage.png');
    expect(container.querySelector('[data-layer="shine-trophy"]')).toBeInTheDocument();
    expect(container.querySelector('[data-layer="shine-crown"]')).toBeInTheDocument();
  });

  it('يجمع الألعاب في تكوين الصفحة المرجعي دون إحصاءات حضور عامة', async () => {
    const { container } = await renderHomePage();
    const showcase = container.querySelector('[data-home-showcase]');

    expect(showcase).toBeInTheDocument();
    expect(
      within(showcase as HTMLElement).queryByRole('region', { name: 'إحصاءات المنصة' }),
    ).not.toBeInTheDocument();
    expect(within(showcase as HTMLElement).queryByRole('region', { name: 'إهداء إلى أميرة' })).not.toBeInTheDocument();
    expect(within(showcase as HTMLElement).getByRole('region', { name: 'الألعاب الأبرز' })).toBeInTheDocument();
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
    expect(within(nav).getByRole('link', { name: 'الدعم' })).toHaveAttribute('href', '/contact');
    expect(within(nav).getByRole('link', { name: 'الحساب' })).toHaveAttribute('href', '/profile');
  });
});
