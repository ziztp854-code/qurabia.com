import { Resend } from 'resend';

type SignupEmailUser = {
  id: string;
  email: string;
  name: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function getEmailClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  return apiKey && from ? { client: new Resend(apiKey), from } : null;
}

async function sendSignupEmail(user: SignupEmailUser, kind: 'welcome' | 'onboarding') {
  const configured = getEmailClient();
  const displayName = user.name?.trim() || 'صديقنا';
  const isWelcome = kind === 'welcome';
  const subject = isWelcome ? 'مرحبًا بك في تحدّي' : 'جاهز لأول تحدٍ؟';
  const text = isWelcome
    ? `مرحبًا ${displayName}، تم إنشاء حسابك في تحدّي بنجاح.`
    : `${displayName}، ابدأ الآن بإنشاء تحدٍ أو الانضمام إلى غرفة واللعب مع أصدقائك.`;
  const html = `<div dir="rtl"><p>${escapeHtml(text)}</p><p><a href="${getApplicationUrl()}">الدخول إلى تحدّي</a></p></div>`;

  if (configured) {
    const { error } = await configured.client.emails.send(
      { from: configured.from, to: user.email, subject, text, html },
      { idempotencyKey: `signup-${kind}-${user.id}` },
    );
    if (error) throw new Error(`Resend rejected the ${kind} email: ${error.message}`);
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.info(`[auth:${kind}] Email delivery simulated for user ${user.id}.`);
    return;
  }

  throw new Error('Signup email delivery is not configured.');
}

function getApplicationUrl() {
  return process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

function getPasswordResetUrl(rawToken: string) {
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return new URL(`/auth/reset-password/${encodeURIComponent(rawToken)}`, baseUrl).toString();
}

export function canDeliverPasswordReset() {
  return (
    process.env.NODE_ENV === 'development' ||
    Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM)
  );
}

export function canDeliverSignupEmail() {
  return canDeliverPasswordReset();
}

export async function sendWelcomeEmail(user: SignupEmailUser) {
  await sendSignupEmail(user, 'welcome');
}

export async function sendOnboardingEmail(user: SignupEmailUser) {
  await sendSignupEmail(user, 'onboarding');
}

export async function sendPasswordResetEmail(email: string, rawToken: string) {
  const resetUrl = getPasswordResetUrl(rawToken);
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;

  if (apiKey && from) {
    const { error } = await new Resend(apiKey).emails.send({
      from,
      to: email,
      subject: 'إعادة تعيين كلمة المرور في تحدّي',
      text: `استخدم الرابط التالي لإعادة تعيين كلمة المرور خلال 30 دقيقة: ${resetUrl}`,
      html: `<p dir="rtl">استخدم الرابط التالي لإعادة تعيين كلمة المرور خلال 30 دقيقة:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
    if (error) throw new Error(`Resend rejected the password reset email: ${error.message}`);
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    // Development-only fallback when Resend credentials are intentionally unavailable.
    console.info(`[auth:password-reset] ${resetUrl}`);
    return;
  }

  throw new Error('Password reset delivery is not configured.');
}
