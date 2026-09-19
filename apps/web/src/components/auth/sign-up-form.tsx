'use client';

import { UserPlus } from 'lucide-react';
import { useActionState } from 'react';
import { registerWithPassword, type AuthActionState } from '@/app/auth/actions';
import { Alert, Button, Input, PasswordInput } from '@/components/ui';

const initialState: AuthActionState = {
  status: 'idle',
  message: '',
};

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(registerWithPassword, initialState);

  return (
    <form className="auth-form" action={formAction}>
      {state.message && (
        <Alert variant={state.status === 'error' ? 'danger' : 'success'}>
          {state.message}
        </Alert>
      )}
      <Input
        label="الاسم الظاهر"
        name="name"
        autoComplete="name"
        required
        error={state.errors?.name}
      />
      <Input
        label="البريد الإلكتروني"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.errors?.email}
      />
      <PasswordInput
        label="كلمة المرور"
        name="password"
        autoComplete="new-password"
        required
        description="10 أحرف على الأقل، وتتضمن حرفًا ورقمًا."
        error={state.errors?.password}
      />
      <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending}>
        <UserPlus />
        إنشاء حساب
      </Button>
    </form>
  );
}
