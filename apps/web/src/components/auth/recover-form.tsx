'use client';

import { MailCheck } from 'lucide-react';
import { useActionState } from 'react';
import { requestPasswordRecovery, type AuthActionState } from '@/app/auth/actions';
import { Alert, Button, Input } from '@/components/ui';

const initialState: AuthActionState = {
  status: 'idle',
  message: '',
};

export function RecoverForm() {
  const [state, formAction, pending] = useActionState(requestPasswordRecovery, initialState);

  return (
    <form className="auth-form" action={formAction}>
      {state.message && (
        <Alert variant={state.status === 'error' ? 'danger' : 'success'}>
          {state.message}
        </Alert>
      )}
      <Input
        label="البريد الإلكتروني"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={state.errors?.email}
      />
      <Button type="submit" size="lg" fullWidth disabled={pending} aria-busy={pending}>
        <MailCheck />
        إرسال تعليمات الاستعادة
      </Button>
    </form>
  );
}
