import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { androidGoogleBrowserLifetimeMs, issueAndroidGoogleGrant } from '@/lib/auth/android-google-handoff';
import { androidGoogleReturnIntent, isAndroidGoogleValue } from '@/lib/auth/android-google-protocol';
import { resolveNextAuthSecret } from '@/lib/auth/options';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';

export const dynamic = 'force-dynamic';

function returnPage(intent?: string, status = 200) {
  const title = intent ? 'تم تسجيل الدخول' : 'تعذّر إكمال تسجيل الدخول';
  const body = intent
    ? `<p>ارجع إلى التطبيق لإكمال تسجيل الدخول.</p><a href="${intent.replaceAll('&', '&amp;')}">العودة إلى تطبيق تحدّي</a>`
    : '<p>ارجع إلى تطبيق تحدّي وابدأ محاولة جديدة.</p>';
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | تحدّي</title>
<style>html{color-scheme:dark}body{background:#070a0f;color:#fff;font:1.1rem system-ui;display:grid;place-items:center;min-height:96vh;margin:0;text-align:center}main{max-width:26rem;padding:2rem}a{display:inline-block;background:#ead19c;color:#141310;font-weight:bold;padding:1rem;border-radius:.8rem;text-decoration:none}</style>
</head><body><main><h1>${title}</h1>${body}</main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export async function GET(request: NextRequest) {
  const parameters = request.nextUrl.searchParams;
  const states = parameters.getAll('state');
  const challenges = parameters.getAll('challenge');
  const [state] = states;
  const [challenge] = challenges;
  if (states.length !== 1 || challenges.length !== 1 || !isAndroidGoogleValue(state) || !isAndroidGoogleValue(challenge)) {
    return returnPage(undefined, 400);
  }

  const secret = resolveNextAuthSecret();
  if (!secret || !hasDatabaseUrl()) return returnPage(undefined, 503);

  const token = await getToken({ req: request, secret });
  const now = Date.now();
  const authenticatedAt = token?.androidGoogleAuthenticatedAt;
  if (
    typeof token?.id !== 'string' || typeof authenticatedAt !== 'number' ||
    authenticatedAt > now || now - authenticatedAt > androidGoogleBrowserLifetimeMs
  ) return returnPage(undefined, 401);

  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: { id: true, status: true, tokenVersion: true },
  });
  if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== token.tokenVersion) {
    return returnPage(undefined, 403);
  }

  const code = await issueAndroidGoogleGrant(prisma.verificationToken, user, state, challenge);
  return returnPage(androidGoogleReturnIntent(state, code));
}
