import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import SignInPage from './page';

vi.mock('@/components/auth/sign-in-form', () => ({
  SignInForm: ({ defaultNext }: { defaultNext: string }) => <output>{defaultNext}</output>,
}));

vi.mock('@/components/layout', () => ({
  Logo: () => <span>شعار</span>,
}));

it('uses player-facing copy and the safe destination for the kingdoms flow', async () => {
  render(
    await SignInPage({
      searchParams: Promise.resolve({ next: '/games/kingdoms/world-map?worldId=mamluk' }),
    }),
  );

  expect(screen.getByRole('heading', { name: 'دخول لاعبي تحدي المماليك' })).toBeInTheDocument();
  expect(screen.getByText('/games/kingdoms/world-map?worldId=mamluk')).toBeInTheDocument();
});

it('recognizes a kingdoms destination whose world is carried in the query string', async () => {
  render(
    await SignInPage({
      searchParams: Promise.resolve({ next: '/games/kingdoms?worldId=mamluk' }),
    }),
  );

  expect(screen.getByRole('heading', { name: 'دخول لاعبي تحدي المماليك' })).toBeInTheDocument();
});

it('keeps the host flow and rejects an external callback destination', async () => {
  render(await SignInPage({ searchParams: Promise.resolve({ next: 'https://evil.example' }) }));

  expect(screen.getByRole('heading', { name: 'دخول المضيفين' })).toBeInTheDocument();
  expect(screen.getByText('/dashboard')).toBeInTheDocument();
});

it('keeps a voice-room destination and renders the live sign-in identity', async () => {
  render(
    await SignInPage({
      searchParams: Promise.resolve({ next: '/voice/room-royal?invite=welcome' }),
    }),
  );

  expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
  expect(screen.getByText('تحدي لايف')).toBeInTheDocument();
  expect(screen.getByText('/voice/room-royal?invite=welcome')).toBeInTheDocument();
});
