import Link from 'next/link';
import { Suspense } from 'react';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';

export default function AdminSignInPage() {
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <AuthShell
      title="دخول الإدارة"
      description="استخدم حسابك المعتاد. ستتحقق المنصة من الدور والحالة من قاعدة البيانات قبل فتح أي أداة إدارية."
      footer={<Link href="/auth/recover">نسيت كلمة المرور؟</Link>}
    >
      <Suspense fallback={null}>
        <SignInForm googleEnabled={googleEnabled} defaultNext="/admin" />
      </Suspense>
    </AuthShell>
  );
}
