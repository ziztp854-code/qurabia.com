import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MonitoringSnapshot } from '@/lib/admin/monitor';
import { MonitorDashboard } from './monitor-dashboard';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const snapshot: MonitoringSnapshot = {
  updatedAt: '2026-09-27T09:00:00.000Z',
  audience: null,
  rooms: { active: 0, created24h: 0, livePlayers: 0, recent: [] },
  newUsers24h: 0,
  errors: { status: 'unconfigured', issues: [] },
  services: {
    databaseQueryMs: 12,
    databaseStatus: 'available',
    web: { status: 'responsive', latencyMs: 20 },
    realtime: { status: 'unavailable', latencyMs: null },
    errorCapture: { server: false, browser: false },
  },
};

describe('MonitorDashboard', () => {
  it('distinguishes unavailable monitoring data from a true zero', () => {
    render(<MonitorDashboard snapshot={snapshot} />);

    expect(screen.getByRole('heading', { name: 'نبض الموقع' })).toBeInTheDocument();
    expect(
      screen.getByText('تعذر قراءة الحضور الآن. حاول تحديث اللوحة بعد قليل.'),
    ).toBeInTheDocument();
    expect(screen.getByText('لا تستجيب')).toBeInTheDocument();
    expect(screen.getByText('لا توجد غرف مباشرة حاليًا.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /عرض الغرف/ })).toHaveAttribute('href', '/admin/rooms');
  });

  it('shows database failure and recent provider issues without exposing a false zero', () => {
    render(
      <MonitorDashboard
        snapshot={{
          ...snapshot,
          rooms: { active: null, created24h: null, livePlayers: null, recent: null },
          newUsers24h: null,
          errors: {
            status: 'available',
            issues: [
              {
                id: '7',
                code: 'WEB-7',
                lastSeen: null,
                url: 'https://sentry.io/issues/7/',
              },
            ],
          },
          services: { ...snapshot.services, databaseStatus: 'unavailable', databaseQueryMs: null },
        }}
      />,
    );

    expect(screen.getByText('تعذر قراءة الغرف الآن.')).toBeInTheDocument();
    expect(screen.getByText('تعذر قراءة المؤشرات')).toBeInTheDocument();
    expect(screen.getByText('مشكلة مفتوحة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'افتح WEB-7 في Sentry' })).toHaveAttribute(
      'href',
      'https://sentry.io/issues/7/',
    );
  });
});
