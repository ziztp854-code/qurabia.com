import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { SignUpForm } from '@/components/auth/sign-up-form';

export default function SignUpPage() {
  return (
    <AuthShell
      title="إنشاء حساب"
      description="جهّز هويتك في تحدّي لتستضيف مسابقاتك وتتابع نتائجك."
      footer={
        <span>
          لديك حساب؟ <Link href="/auth/sign-in">تسجيل الدخول</Link>
        </span>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
