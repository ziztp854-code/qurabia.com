import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudienceRadar } from './audience-radar';

describe('AudienceRadar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('يعرض أعداد الإدارة بالتسمية الدقيقة ووقت التحديث دون ذكر أماكن', () => {
    render(
      <AudienceRadar
        initial={{
          presentNow: 4,
          uniqueToday: 12,
          viewsToday: 18,
          livePlayers: 3,
          recentLogins: 7,
          updatedAt: '2026-08-17T12:34:56.000Z',
          source: 'memory',
        }}
      />,
    );

    expect(screen.getByRole('region', { name: 'رادار الجمهور' })).toBeInTheDocument();
    expect(screen.getByLabelText('متصفحات متصلة')).toHaveTextContent('4');
    expect(screen.getByText('متصفحات متصلة')).toBeInTheDocument();
    expect(screen.getByText('زائرًا فريدًا اليوم')).toBeInTheDocument();
    expect(screen.getByLabelText('متصلون داخل غرفة حيّة')).toHaveTextContent('3');
    expect(screen.getByText('آخر تحديث: 12:34:56 UTC')).toBeInTheDocument();
    expect(screen.queryByText(/رياض/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Asia/i)).not.toBeInTheDocument();
  });

  it('يعرض حالة فراغ صريحة عند غياب الحضور والغرف الحية', () => {
    render(
      <AudienceRadar
        initial={{
          presentNow: 0,
          uniqueToday: 0,
          viewsToday: 0,
          livePlayers: 0,
          recentLogins: 0,
          updatedAt: '2026-08-17T12:34:56.000Z',
          source: 'memory',
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'لا توجد متصفحات متصلة أو مشاركون داخل غرفة حيّة الآن.',
    );
  });

  it('يعرض حالتي التحميل والخطأ عند تعذر التحديث', async () => {
    let rejectFetch!: (reason?: unknown) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectFetch = reject;
      }),
    );
    render(
      <AudienceRadar
        initial={{
          presentNow: 4,
          uniqueToday: 12,
          viewsToday: 18,
          livePlayers: 3,
          recentLogins: 7,
          updatedAt: '2026-08-17T12:34:56.000Z',
          source: 'memory',
        }}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تحديث بيانات الحضور.');

    await act(async () => {
      rejectFetch(new Error('network'));
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحديث بيانات الحضور.');
  });

  it('يعرض حالة خطأ صريحة عندما تفشل القراءة الخادمية الأولى', () => {
    render(<AudienceRadar initial={null} />);

    expect(screen.getByLabelText('متصفحات متصلة')).toHaveTextContent('—');
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر تحديث بيانات الحضور.');
  });
});
