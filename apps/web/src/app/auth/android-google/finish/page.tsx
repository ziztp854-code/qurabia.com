import { AndroidGoogleFinish } from '@/components/auth/android-google-finish';
import { AuthShell } from '@/components/auth/auth-shell';

export const metadata = { robots: { index: false, follow: false } };

export default function AndroidGoogleFinishPage() {
  return (
    <AuthShell title="دخول تطبيق تحدّي" description="إكمال الدخول بالحساب الذي اخترته في المتصفح." footer={null}>
      <AndroidGoogleFinish />
    </AuthShell>
  );
}
