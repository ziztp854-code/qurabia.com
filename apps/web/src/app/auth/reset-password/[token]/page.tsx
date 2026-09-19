import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthShell
      title="إعادة تعيين كلمة المرور"
      description="اختر كلمة مرور جديدة لحسابك. رابط الاستعادة صالح للاستخدام مرة واحدة فقط."
      footer={<Link href="/auth/sign-in">العودة لتسجيل الدخول</Link>}
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
