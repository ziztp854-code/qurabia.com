'use client';

import { KeyRound, LogIn } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Button, Alert, Input, PasswordInput, Spinner } from '@/components/ui';
import { sanitizeCallbackPath } from '@/lib/auth/redirects';
import { signInSchema } from '@/lib/auth/validation';

const genericMessage = 'تعذّر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.';
const googleMessage = 'تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى.';

function returnErrorMessage(error: string | null) {
  switch (error) {
    case null:
    case '':
      return '';
    case 'OAuthAccountNotLinked':
      return 'استخدم طريقة تسجيل الدخول الأصلية لهذا الحساب ثم حاول مرة أخرى.';
    case 'OAuthSignin':
    case 'OAuthCallback':
    case 'OAuthCreateAccount':
    case 'Callback':
      return googleMessage;
    case 'AccessDenied':
    case 'account':
      return 'الحساب غير متاح حاليًا.';
    case 'session-revoked':
      return 'انتهت صلاحية الجلسة. سجّل الدخول مرة أخرى.';
    default:
      return genericMessage;
  }
}

export function SignInForm({
  googleEnabled = false,
  showGoogle = true,
  defaultNext = '/dashboard',
}: {
  googleEnabled?: boolean;
  showGoogle?: boolean;
  defaultNext?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeCallbackPath(searchParams.get('next') || defaultNext);
  const returnError = searchParams.get('error');
  const [previousReturnError, setPreviousReturnError] = useState(returnError);
  const [error, setError] = useState(returnErrorMessage(returnError));
  const [pending, setPending] = useState<'google' | 'credentials' | null>(null);
  const inFlight = useRef(false);

  if (previousReturnError !== returnError) {
    setPreviousReturnError(returnError);
    setError(returnErrorMessage(returnError));
  }

  async function onGoogleSignIn() {
    if (!googleEnabled || inFlight.current) return;
    inFlight.current = true;
    setError('');
    setPending('google');
    try {
      await signIn('google', { callbackUrl: next });
    } catch {
      setError(googleMessage);
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setError('');

    const formData = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    if (!parsed.success) {
      setError('راجع البريد وكلمة المرور ثم حاول مرة أخرى.');
      return;
    }

    inFlight.current = true;
    setPending('credentials');
    try {
      const result = await signIn('credentials', {
        ...parsed.data,
        redirect: false,
        callbackUrl: next,
      });

      if (!result?.ok) {
        setError(genericMessage);
        return;
      }

      router.push(result.url || next);
      router.refresh();
    } catch {
      setError(genericMessage);
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      {error && <Alert variant="danger">{error}</Alert>}
      {showGoogle && (
        <Button
          type="button"
          variant="outline"
          fullWidth
          disabled={!googleEnabled || pending !== null}
          aria-busy={pending === 'google'}
          onClick={onGoogleSignIn}
        >
          {pending === 'google' ? <Spinner label="جارٍ تسجيل الدخول عبر Google" /> : <KeyRound />}
          دخول المضيف عبر Google
        </Button>
      )}
      {showGoogle && !googleEnabled && (
        <p className="field-message">
          لم يتم إعداد Google OAuth بعد. يمكن للمضيف استخدام البريد وكلمة المرور مؤقتًا.
        </p>
      )}
      <Input label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required />
      <PasswordInput label="كلمة المرور" name="password" autoComplete="current-password" required />
      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={pending !== null}
        aria-busy={pending === 'credentials'}
      >
        {pending === 'credentials' ? <Spinner label="جارٍ تسجيل الدخول" /> : <LogIn />}
        دخول بالبريد
      </Button>
    </form>
  );
}
