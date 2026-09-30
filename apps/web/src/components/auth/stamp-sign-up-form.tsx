'use client';

import { useActionState } from 'react';
import { registerWithStamp } from '@/app/auth/stamp/actions';
import { Alert, Button, ButtonLink, Input, PasswordInput } from '@/components/ui';
import type { AuthActionState } from '@/app/auth/actions';

const initialState: AuthActionState = { status: 'idle', message: '' };

export function StampSignUpForm() {
  const [state, formAction, pending] = useActionState(registerWithStamp, initialState);

  return (
    <div className="auth-form">
      {state.message && (
        <Alert variant={state.status === 'error' ? 'danger' : 'success'}>{state.message}</Alert>
      )}
      {state.status === 'success' ? (
        <ButtonLink href="/auth/stamp" size="lg" fullWidth>
          دخول صاحب الختم
        </ButtonLink>
      ) : (
        <form className="auth-form" action={formAction}>
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
          <Input
            label="رمز الختم"
            name="code"
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            placeholder="THD-KNT-XXXX-XXXX"
            required
            error={state.errors?.code}
          />
          <Button
            type="submit"
            variant="gold"
            size="lg"
            fullWidth
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? 'جارٍ تفعيل الختم…' : 'إنشاء الحساب وتفعيل الختم'}
          </Button>
        </form>
      )}
    </div>
  );
}
