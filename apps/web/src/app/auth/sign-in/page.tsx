import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function SignInPage() {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <AuthShell
      title="دخول المضيفين"
      description="سجّل دخولك كمضيف لإنشاء المسابقات وتشغيل الغرف. اللاعبون ينضمون كزوار عبر الرمز أو رابط الدعوة."
      footer={
        <>
          <Link href="/auth/recover">نسيت كلمة المرور؟</Link>
          <span>
            لا تملك حسابًا؟ <Link href="/auth/sign-up">إنشاء حساب</Link>
          </span>
        </>
      }
    >
      <Suspense fallback={null}>
        <SignInForm googleEnabled={googleEnabled} />
      </Suspense>
    </AuthShell>
  );
}
