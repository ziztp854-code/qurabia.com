import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DisplayPage from './page';

const prismaMocks = vi.hoisted(() => ({
  hasDatabaseUrl: vi.fn(() => false),
  getPrismaClient: vi.fn(),
}));

vi.mock('@/lib/auth/prisma', () => ({
  hasDatabaseUrl: prismaMocks.hasDatabaseUrl,
  getPrismaClient: prismaMocks.getPrismaClient,
}));

describe('DisplayPage', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is a dedicated dark presentation surface instead of a navigation hub', async () => {
    const { container } = render(await DisplayPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: 'شاشة العرض جاهزة' })).toBeVisible();
    expect(screen.getByText('ابدأ الجولة من لوحة المضيف')).toBeVisible();
    expect(container.querySelector('.display-waiting.royal-live')).toBeInTheDocument();
    expect(container.querySelector('main main')).not.toBeInTheDocument();
    expect(container.querySelector('.display-waiting.cinematic-question')).not.toBeInTheDocument();
    expect(screen.queryByText('خيارات شاشة العرض')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('does not select an unrelated live session when no session id is provided', async () => {
    prismaMocks.hasDatabaseUrl.mockReturnValueOnce(true);

    render(await DisplayPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole('heading', { name: 'شاشة العرض جاهزة' })).toBeVisible();
    expect(prismaMocks.getPrismaClient).not.toHaveBeenCalled();
  });

  it('renders safe public previews inside the approved live frames', async () => {
    const player = render(
      await DisplayPage({ searchParams: Promise.resolve({ preview: 'player' }) }),
    );
    expect(screen.getByRole('region', { name: 'السؤال المباشر' })).toHaveAttribute(
      'data-screen',
      'question',
    );
    player.unmount();

    const host = render(
      await DisplayPage({ searchParams: Promise.resolve({ preview: 'host' }) }),
    );
    expect(screen.getByRole('region', { name: 'لوحة المضيف' })).toHaveAttribute(
      'data-screen',
      'host',
    );
    host.unmount();

    const question = render(
      await DisplayPage({ searchParams: Promise.resolve({ preview: 'question' }) }),
    );
    expect(screen.getByRole('region', { name: 'السؤال المباشر' })).toHaveAttribute(
      'data-screen',
      'question',
    );
    question.unmount();

    render(await DisplayPage({ searchParams: Promise.resolve({ preview: 'finale' }) }));
    expect(screen.getByRole('region', { name: 'التتويج' })).toHaveAttribute(
      'data-screen',
      'finale',
    );
    expect(prismaMocks.getPrismaClient).not.toHaveBeenCalled();
  });
});
