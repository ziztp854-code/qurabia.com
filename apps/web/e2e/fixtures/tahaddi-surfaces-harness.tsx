// Real presentation components, synthetic HTTP/data. Form intentionally has no auth transport.
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/cairo';
import '../../tokens.css';
import '../../src/app/globals.css';
import '../../src/app/voice/voice.css';
import { VoiceLobby } from '../../src/components/voice/voice-lobby';
import { AuthShell } from '../../src/components/auth/auth-shell';
import { CommunityProfilePage } from '../../src/components/community/profile-view';
import { Input, PasswordInput, Button } from '../../src/components/ui';
import { profile } from './tahaddi-surfaces-data';
const mode = new URLSearchParams(location.search).get('surface');
createRoot(document.getElementById('root')!).render(
  mode === 'profile' ? (
    <main style={{ maxWidth: 1100, margin: 'auto', padding: 16 }}>
      <CommunityProfilePage accountNumber={124} initialProfile={profile} />
    </main>
  ) : mode === 'login' ? (
    <AuthShell
      live
      title="تسجيل الدخول"
      description="أهلًا بك في تحدي لايف. سجّل دخولك للانضمام إلى اللقاء."
      footer={<a href="/auth/sign-up">إنشاء حساب</a>}
    >
      <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
        <Input label="البريد الإلكتروني" name="email" type="email" autoComplete="email" />
        <PasswordInput label="كلمة المرور" name="password" autoComplete="current-password" />
        <Button fullWidth type="submit">
          تسجيل الدخول
        </Button>
        <p>معاينة مرئية محلية — لا تُرسل بيانات دخول</p>
      </form>
    </AuthShell>
  ) : (
    <VoiceLobby user={null} />
  ),
);
