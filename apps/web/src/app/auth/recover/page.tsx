import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { RecoverForm } from '@/components/auth/recover-form';

export default function RecoverPage() {
  return (
    <AuthShell
      title="استعادة الحساب"
      description="أدخل بريدك وسنرسل تعليمات الاستعادة إذا كان الحساب موجودًا."
      footer={<Link href="/auth/sign-in">العودة لتسجيل الدخول</Link>}
    >
      <RecoverForm />
    </AuthShell>
  );
}
