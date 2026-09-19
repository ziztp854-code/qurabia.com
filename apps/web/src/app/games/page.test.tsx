import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { getLiveStats } from '@/lib/presence/live-stats';
import GamesPage from './page';

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/presence/live-stats', () => ({
  getLiveStats: vi.fn().mockResolvedValue({ presentNow: 12, livePlayers: 7 }),
}));

describe('GamesPage', () => {
  it('لا يكشف إحصاءات الحضور في كتالوج الألعاب العام', async () => {
    render(<ThemeProvider>{await GamesPage()}</ThemeProvider>);

    expect(getLiveStats).not.toHaveBeenCalled();
    expect(screen.queryByText('متواجد الآن')).not.toBeInTheDocument();
    expect(screen.queryByText('لاعب في غرفة حيّة')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ابدأ أول غرفة الآن' })).not.toBeInTheDocument();
  });
});
