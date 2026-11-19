'use client';

import { signIn } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getAndroidGooglePlugin } from '@/lib/auth/android-google-client';
import { androidGoogleProvider, isAndroidGoogleValue } from '@/lib/auth/android-google-protocol';
import { sanitizeCallbackPath } from '@/lib/auth/redirects';

export function AndroidGoogleFinish() {
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function finish() {
      try {
        const grant = await getAndroidGooglePlugin()?.finish();
        if (
          !isAndroidGoogleValue(grant?.code) || !isAndroidGoogleValue(grant.state) ||
          !isAndroidGoogleValue(grant.verifier)
        ) {
          setFailed(true);
          return;
        }
        const { code, state, verifier } = grant;
        const { origin } = window.location;
        const destination = new URL(sanitizeCallbackPath(grant.next), origin);
        const next = destination.origin === origin ? destination.href : new URL('/dashboard', origin).href;
        const result = await signIn(androidGoogleProvider, { code, state, verifier, callbackUrl: next, redirect: false });
        if (result?.ok && !result.error) {
          window.location.replace(next);
          return;
        }
      } catch {
        // The grant is single-use. A failed exchange needs a new browser attempt.
      }
      setFailed(true);
    }

    void finish();
  }, []);

  return failed ? (
    <>
      <p role="alert">تعذّر إكمال تسجيل الدخول. ابدأ محاولة جديدة.</p>
      <Link href="/auth/sign-in/">العودة لتسجيل الدخول</Link>
    </>
  ) : <p role="status">جارٍ إكمال تسجيل الدخول في تطبيق تحدّي…</p>;
}
