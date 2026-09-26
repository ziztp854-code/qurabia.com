import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { StampSignUpForm } from '@/components/auth/stamp-sign-up-form';

export default function StampSignUpPage() {
  return (
    <AuthShell
      title="التسجيل بالختم"
      description="أنشئ حسابك برمز الختم الذي مُنح لك. تُفعّل رتبتك فور التسجيل، ثم تدخل ببريدك وكلمة المرور."
      footer={
        <span>
          لديك حساب؟ <Link href="/auth/stamp">دخول صاحب الختم</Link>
        </span>
      }
    >
      <StampSignUpForm />
    </AuthShell>
  );
}
