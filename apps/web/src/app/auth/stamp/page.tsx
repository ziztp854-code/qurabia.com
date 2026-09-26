import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function StampSignInPage() {
  return (
    <AuthShell
      title="دخول صاحب الختم"
      description="ادخل بالبريد وكلمة المرور اللذين أنشأت بهما حسابك. تظهر رتبتك الممنوحة بالختم ما دامت سارية."
      footer={
        <>
          <Link href="/auth/recover">نسيت كلمة المرور؟</Link>
          <span>
            لديك ختم ولم تسجل بعد؟ <Link href="/auth/stamp/sign-up">أنشئ حسابك بالختم</Link>
          </span>
        </>
      }
    >
      <Suspense fallback={null}>
        <SignInForm showGoogle={false} defaultNext="/orders" />
      </Suspense>
    </AuthShell>
  );
}
