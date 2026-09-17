import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selected: vi.fn(),
  sessions: vi.fn(),
  quizzes: vi.fn(),
  host: vi.fn(),
}));
vi.mock('@/app/live/actions', () => ({ startLiveSession: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireActiveUser: async () => ({ id: 'host-1' }) }));
vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: () => true,
  getPrismaClient: () => ({
    liveSession: { findFirst: mocks.selected, findMany: mocks.sessions },
    quiz: { findMany: mocks.quizzes },
  }),
}));
vi.mock('@/lib/live/access-token', () => ({ createHostLiveAccessToken: () => 'test-token' }));
vi.mock('@/components/live', () => ({
  LiveHostExperience: (props: unknown) => {
    mocks.host(props);
    return null;
  },
}));
vi.mock('@/components/layout', () => ({
  HostLayout: ({ children }: { children: React.ReactNode }) => children,
}));
import Page from './page';

describe('host dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessions.mockResolvedValue([]);
    mocks.quizzes.mockResolvedValue([]);
  });

  it('lets the host resume a live room after leaving the dashboard', async () => {
    mocks.sessions.mockResolvedValue([
      {
        id: 'session-1',
        roomCode: 'ABC123',
        status: 'ACTIVE',
        quiz: { title: 'مسابقة المعرفة' },
        _count: { participants: 3 },
      },
    ]);
    render(await Page({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole('link', { name: 'متابعة الغرفة' })).toHaveAttribute(
      'href',
      '/host?sessionId=session-1',
    );
    expect(screen.getByText('مسابقة المعرفة')).toBeVisible();
    expect(screen.getByText('مشاركون في الغرف')).toHaveTextContent('مشاركون في الغرف');
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('بث مباشر قيد التشغيل')).toBeVisible();
    expect(screen.getByText('1 نشطة')).toBeVisible();
  });
});
