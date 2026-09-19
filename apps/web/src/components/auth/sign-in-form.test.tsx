import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SignInForm } from './sign-in-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('SignInForm Google button', () => {
  it('disables Google login when OAuth env keys are missing', () => {
    render(<SignInForm googleEnabled={false} />);
    expect(screen.getByRole('button', { name: 'دخول المضيف عبر Google' })).toBeDisabled();
    expect(screen.getByText(/لم يتم إعداد Google OAuth بعد/)).toBeInTheDocument();
  });

  it('enables Google login when OAuth is configured', () => {
    render(<SignInForm googleEnabled />);
    expect(screen.getByRole('button', { name: 'دخول المضيف عبر Google' })).toBeEnabled();
  });
});
