import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BalootJoinPage from './page';

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/lib/auth/session', () => ({ getCurrentSession: async () => null }));
vi.mock('@/components/layout', () => ({ SiteLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/instant-games', () => ({
  InstantGameRoom: ({ mode, initialCode }: { mode: string; initialCode: string }) => <div>{mode}:{initialCode}</div>,
}));

describe('BalootJoinPage', () => {
  it('passes a valid invite code to the join experience', async () => {
    render(await BalootJoinPage({ params: Promise.resolve({ code: '123456' }) }));
    expect(screen.getByText('baloot:123456')).toBeInTheDocument();
  });
  it('rejects invalid codes', async () => {
    await expect(BalootJoinPage({ params: Promise.resolve({ code: 'not-a-code' }) })).rejects.toThrow('NOT_FOUND');
  });
});
