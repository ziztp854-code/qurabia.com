import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import DedicationPage, { metadata } from './page';

vi.mock('@/lib/auth/session', () => ({
  getCurrentSession: vi.fn().mockResolvedValue(null),
}));

describe('DedicationPage', () => {
  it('يحفظ نص الإهداء كاملًا في صفحته المستقلة', async () => {
    render(<ThemeProvider>{await DedicationPage()}</ThemeProvider>);

    expect(screen.getByRole('heading', { level: 1, name: 'أميرة' })).toBeInTheDocument();
    expect(screen.getByText('تقديرًا لما قدمته من تشجيع وتحفيز،')).toBeInTheDocument();
    expect(screen.getByText('كان له أثر في استمرار الفكرة وتطورها.')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'تحدي، فكرة بدأت بطموح' }),
    ).toBeInTheDocument();
    expect(screen.getByText('واستمرت بدعمٍ صنع الفرق.')).toBeInTheDocument();
    expect(screen.getByText('إلى أميرة، شكرًا لأنك كنتِ جزءًا من البداية.')).toBeInTheDocument();
    expect(screen.queryByText('عرض الإهداء')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'إهداء تحدّي إلى أميرة' })).toHaveAttribute(
      'src',
      expect.stringContaining('og.png'),
    );
    expect(metadata.description).toContain('تقديرًا لتشجيعها ودورها');
  });
});
