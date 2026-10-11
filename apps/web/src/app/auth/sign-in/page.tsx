import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { sanitizeCallbackPath } from '@/lib/auth/redirects';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const rawNext = (await searchParams).next;
  const next = sanitizeCallbackPath(typeof rawNext === 'string' ? rawNext : undefined);
  const nextPathname = next.split(/[?#]/u, 1)[0];
  const isKingdoms =
    nextPathname === '/games/kingdoms' || nextPathname.startsWith('/games/kingdoms/');

  return (
    <AuthShell
      title={isKingdoms ? 'دخول لاعبي تحدي المماليك' : 'دخول المضيفين'}
      description={
        isKingdoms
          ? 'سجّل دخولك للعودة إلى قريتك ومتابعة عالم المماليك من حسابك.'
          : 'سجّل دخولك كمضيف لإنشاء المسابقات وتشغيل الغرف. اللاعبون ينضمون كزوار عبر الرمز أو رابط الدعوة.'
      }
      footer={
        <>
          <Link href="/auth/recover">نسيت كلمة المرور؟</Link>
          <span>
            لا تملك حسابًا؟ <Link href="/auth/sign-up">إنشاء حساب</Link>
          </span>
          <Link href="/auth/stamp">دخول صاحب الختم</Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <SignInForm googleEnabled={googleEnabled} defaultNext={next} />
      </Suspense>
    </AuthShell>
  );
}
