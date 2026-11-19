'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { androidGoogleReturn } from '@/lib/auth/android-google-protocol';

export function AndroidGoogleBrowser({ state, challenge }: { state: string; challenge: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function continueWithGoogle() {
    setPending(true);
    setFailed(false);
    const parameters = new URLSearchParams({ state, challenge });
    try {
      await signIn('google', { callbackUrl: `${androidGoogleReturn}?${parameters}` });
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      {failed && <Alert variant="danger">تعذّر الاتصال بـ Google. حاول مرة أخرى.</Alert>}
      <Button type="button" fullWidth disabled={pending} aria-busy={pending} onClick={continueWithGoogle}>
        {pending ? 'جارٍ فتح Google…' : 'المتابعة باستخدام Google'}
      </Button>
    </>
  );
}
