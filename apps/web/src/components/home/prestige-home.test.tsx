import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { PrestigeHome } from './prestige-home';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('PrestigeHome rank showcase', () => {
  it('renders every court rank as its full artwork card', () => {
    render(
      <ThemeProvider>
        <PrestigeHome user={null} />
      </ThemeProvider>,
    );

    const expectedCards = [
      ['المشاهد', '/ranks/spectator.png'],
      ['الفارس', '/ranks/knight.png'],
      ['الأمير', '/ranks/prince.png'],
      ['السلطان', '/ranks/sultan.png'],
    ] as const;

    for (const [rank, source] of expectedCards) {
      const artwork = screen.getByRole('img', { name: `بطاقة رتبة ${rank}` });
      const renderedSource = artwork.getAttribute('src') ?? '';
      const originalSource = new URL(renderedSource, 'http://localhost').searchParams.get('url');
      expect(originalSource ?? renderedSource).toBe(source);
    }
  });
});
