import { AndroidGoogleBrowser } from '@/components/auth/android-google-browser';
import { AuthShell } from '@/components/auth/auth-shell';
import { isAndroidGoogleValue } from '@/lib/auth/android-google-protocol';

export const metadata = { robots: { index: false, follow: false } };

export default async function AndroidGoogleStartPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[]; challenge?: string | string[] }>;
}) {
  const { state, challenge } = await searchParams;
  const enabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const valid = enabled && isAndroidGoogleValue(state) && isAndroidGoogleValue(challenge);

  return (
    <AuthShell
      title="دخول تطبيق تحدّي"
      description={valid ? 'أكمل تسجيل الدخول في المتصفح، ثم ارجع إلى تطبيق تحدّي.' : 'افتح تطبيق تحدّي وابدأ محاولة تسجيل دخول جديدة.'}
      footer={null}
    >
      {valid && <AndroidGoogleBrowser state={state} challenge={challenge} />}
    </AuthShell>
  );
}
