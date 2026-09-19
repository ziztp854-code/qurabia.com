'use client';

import { KeyRound, LogIn } from 'lucide-react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Alert, Input, PasswordInput, Spinner } from '@/components/ui';
import { sanitizeCallbackPath } from '@/lib/auth/redirects';
import { signInSchema } from '@/lib/auth/validation';

const genericMessage = 'تعذّر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.';

export function SignInForm({
  googleEnabled = false,
  defaultNext = '/dashboard',
}: {
  googleEnabled?: boolean;
  defaultNext?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeCallbackPath(searchParams.get('next') || defaultNext);
  const accountError = searchParams.get('error') === 'account';
  const [error, setError] = useState(accountError ? 'الحساب غير متاح حاليًا.' : '');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    setPending(true);
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
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button
        type="button"
        variant="outline"
        fullWidth
        disabled={!googleEnabled || pending}
        onClick={() => signIn('google', { callbackUrl: next })}
      >
        <KeyRound />
        دخول المضيف عبر Google
      </Button>
      {!googleEnabled && (
        <p className="field-message">
          لم يتم إعداد Google OAuth بعد. يمكن للمضيف استخدام البريد وكلمة المرور مؤقتًا.
        </p>
      )}
      <Input label="البريد الإلكتروني" name="email" type="email" autoComplete="email" required />
      <PasswordInput label="كلمة المرور" name="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending}>
        {pending ? <Spinner label="جارٍ تسجيل الدخول" /> : <LogIn />}
        دخول بالبريد
      </Button>
    </form>
  );
}
