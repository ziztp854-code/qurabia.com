'use client';

import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';
import {
  resetPassword,
  type ResetPasswordActionState,
} from '@/app/auth/reset-password/[token]/actions';
import { Alert, Button, PasswordInput } from '@/components/ui';

const initialState: ResetPasswordActionState = { status: 'idle', message: '' };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    resetPassword.bind(null, token),
    initialState,
  );

  if (state.status === 'success') {
    return (
      <div className="auth-form">
        <Alert variant="success">{state.message}</Alert>
        <Link className="text-link" href="/auth/sign-in">
          الانتقال إلى تسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" action={formAction}>
      {state.message && <Alert variant="danger">{state.message}</Alert>}
      <PasswordInput
        label="كلمة المرور الجديدة"
        name="password"
        autoComplete="new-password"
        required
        description="10 أحرف على الأقل، وتتضمن حرفًا ورقمًا."
        error={state.errors?.password}
      />
      <PasswordInput
        label="تأكيد كلمة المرور"
        name="confirmPassword"
        autoComplete="new-password"
        required
        error={state.errors?.confirmPassword}
      />
      <Button
        type="submit"
        size="lg"
        className="button-full"
        disabled={pending}
        aria-busy={pending}
      >
        <KeyRound />
        تحديث كلمة المرور
      </Button>
    </form>
  );
}
