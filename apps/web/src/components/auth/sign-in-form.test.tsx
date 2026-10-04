import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInForm } from './sign-in-form';

const mocks = vi.hoisted(() => ({
  query: '',
  signIn: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next-auth/react', () => ({ signIn: mocks.signIn }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

beforeEach(() => {
  mocks.query = '';
  vi.resetAllMocks();
});

const googleMessage = 'تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى.';

function fillCredentials() {
  fireEvent.change(screen.getByLabelText('البريد الإلكتروني'), {
    target: { value: 'host@example.com' },
  });
  fireEvent.change(screen.getByLabelText('كلمة المرور'), {
    target: { value: 'valid-password' },
  });
}

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

  it('shows only password login on the stamp holder entry', () => {
    render(<SignInForm showGoogle={false} defaultNext="/orders" />);
    expect(
      screen.queryByRole('button', { name: 'دخول المضيف عبر Google' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دخول بالبريد' })).toBeEnabled();
  });

  it.each(['OAuthSignin', 'OAuthCallback', 'OAuthCreateAccount', 'Callback'])(
    'explains %s safely on OAuth return',
    (error) => {
      mocks.query = new URLSearchParams({ error }).toString();
      render(<SignInForm googleEnabled />);
      expect(screen.getByRole('alert')).toHaveTextContent(googleMessage);
      expect(screen.getByRole('alert')).not.toHaveTextContent(error);
    },
  );

  it('asks an unlinked account to use its original login method', () => {
    mocks.query = 'error=OAuthAccountNotLinked';
    render(<SignInForm googleEnabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('طريقة تسجيل الدخول الأصلية');
  });

  it.each(['AccessDenied', 'account'])('explains an unavailable account: %s', (error) => {
    mocks.query = new URLSearchParams({ error }).toString();
    render(<SignInForm googleEnabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('الحساب غير متاح حاليًا.');
  });

  it('asks the user to sign in again after a revoked session', () => {
    mocks.query = 'error=session-revoked';
    render(<SignInForm googleEnabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('سجّل الدخول مرة أخرى');
  });

  it('does not reflect unknown error codes or URLs', () => {
    const unsafe = 'https://example.invalid/private?token=do-not-display';
    mocks.query = new URLSearchParams({ error: unsafe }).toString();
    render(<SignInForm googleEnabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تسجيل الدخول.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(unsafe);
    expect(screen.getByRole('alert')).not.toHaveTextContent('do-not-display');
  });

  it('updates return errors when navigation reuses the same component', () => {
    mocks.query = 'error=account';
    const view = render(<SignInForm googleEnabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('الحساب غير متاح حاليًا.');
    mocks.query = 'error=OAuthAccountNotLinked';
    view.rerender(<SignInForm googleEnabled />);
    expect(screen.getByRole('alert')).toHaveTextContent('طريقة تسجيل الدخول الأصلية');
    mocks.query = '';
    view.rerender(<SignInForm googleEnabled />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('blocks duplicate Google clicks and password submission while redirect starts', async () => {
    let complete!: () => void;
    mocks.signIn.mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    mocks.query = 'next=%2Forders%3Fpage%3D2';
    render(<SignInForm googleEnabled />);
    fillCredentials();
    const google = screen.getByRole('button', { name: 'دخول المضيف عبر Google' });
    const password = screen.getByRole('button', { name: 'دخول بالبريد' });
    fireEvent.click(google);
    expect(google).toBeDisabled();
    expect(google).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تسجيل الدخول عبر Google');
    expect(password).toBeDisabled();
    expect(password).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(google);
    fireEvent.submit(password.closest('form')!);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/orders?page=2' });
    await act(async () => { complete(); });
    expect(google).toBeEnabled();
    expect(password).toBeEnabled();
  });

  it('recovers from a Google rejection without exposing exception details', async () => {
    const exceptionMarker = 'private-token-must-not-display';
    mocks.signIn.mockRejectedValueOnce(new Error(exceptionMarker));
    mocks.query = 'error=OAuthAccountNotLinked&next=https%3A%2F%2Fexample.invalid';
    render(<SignInForm googleEnabled />);
    fireEvent.click(screen.getByRole('button', { name: 'دخول المضيف عبر Google' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(googleMessage));
    expect(screen.getByRole('alert')).not.toHaveTextContent(exceptionMarker);
    expect(screen.getByRole('alert')).not.toHaveTextContent('طريقة تسجيل الدخول الأصلية');
    expect(mocks.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/dashboard' });
    expect(screen.getByRole('button', { name: 'دخول المضيف عبر Google' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'دخول بالبريد' })).toBeEnabled();
    mocks.signIn.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'دخول المضيف عبر Google' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(mocks.signIn).toHaveBeenCalledTimes(2);
  });

  it('blocks Google and duplicate password submits while password login is pending', async () => {
    let complete!: (result: { ok: boolean; url: string }) => void;
    mocks.signIn.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    render(<SignInForm googleEnabled />);
    fillCredentials();
    const password = screen.getByRole('button', { name: 'دخول بالبريد' });
    const google = screen.getByRole('button', { name: 'دخول المضيف عبر Google' });
    fireEvent.submit(password.closest('form')!);
    expect(password).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ تسجيل الدخول');
    expect(google).toBeDisabled();
    expect(google).toHaveAttribute('aria-busy', 'false');
    fireEvent.submit(password.closest('form')!);
    fireEvent.click(google);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    await act(async () => { complete({ ok: true, url: '/dashboard' }); });
    expect(mocks.push).toHaveBeenCalledWith('/dashboard');
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(password).toBeEnabled();
  });
});
