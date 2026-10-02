import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { PrestigeHome } from './prestige-home';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PrestigeHome Mamluk world', () => {
  it('shows the village artwork and world destinations in place of rank cards', () => {
    render(
      <ThemeProvider>
        <PrestigeHome user={null} />
      </ThemeProvider>,
    );

    const world = screen.getByRole('region', { name: 'عالم المماليك' });
    const artwork = within(world).getByRole('img');
    const renderedSource = artwork.getAttribute('src') ?? '';
    const originalSource = new URL(renderedSource, 'http://localhost').searchParams.get('url');
    expect(originalSource ?? renderedSource).toBe('/game-art/kingdoms/village-oasis.webp');
    expect(within(world).getByRole('link', { name: /ادخل عالم المماليك/ })).toHaveAttribute(
      'href',
      '/games/kingdoms',
    );
    expect(within(world).getByRole('link', { name: /استكشف خريطة العالم/ })).toHaveAttribute(
      'href',
      '/games/kingdoms/world-map',
    );
    expect(screen.queryByRole('img', { name: /بطاقة رتبة/ })).not.toBeInTheDocument();
  });

  it('renders the signed-in player rank as its real emblem artwork', () => {
    render(
      <ThemeProvider>
        <PrestigeHome
          user={{ name: 'لاعب تحدّي', role: 'USER' }}
          rank={{ code: 'PRINCE', name: 'الأمير', emblem: '♛' }}
        />
      </ThemeProvider>,
    );

    const emblem = screen.getByRole('img', { name: 'شارة رتبة الأمير' });
    const renderedSource = emblem.getAttribute('src') ?? '';
    const originalSource = new URL(renderedSource, 'http://localhost').searchParams.get('url');
    expect(originalSource ?? renderedSource).toBe('/ranks/emblem-prince.png');
  });
});
