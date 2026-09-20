import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { signInSchema } from '@/lib/auth/validation';
import {
  mobileClientIp,
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
  parseMobileJson,
} from '@/lib/mobile-auth/http';
import { createPrismaMobileSessionRepository } from '@/lib/mobile-auth/prisma-session-repository';
import { createMobileSession } from '@/lib/mobile-auth/session-service';
import { resolveMobileAuthSecret } from '@/lib/mobile-auth/tokens';
import {
  installationIdSchema,
  installationSecretSchema,
} from '@/lib/mobile-notifications/installation-capability';

export const runtime = 'nodejs';

const inputSchema = signInSchema
  .extend({
    installationId: installationIdSchema.optional(),
    installationSecret: installationSecretSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.installationId) !== Boolean(value.installationSecret)) {
      context.addIssue({ code: 'custom', message: 'Complete installation capability is required.' });
    }
  });
const genericMessage = 'تعذّر تسجيل الدخول. تحقق من البيانات وحاول مرة أخرى.';

export async function POST(request: Request) {
  const requestId = mobileRequestId(request);
  const input = await parseMobileJson(request, inputSchema);
  if (!input) return mobileFailure('INVALID_REQUEST', 'راجع بيانات الدخول.', requestId, 400);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الحسابات غير متاحة حاليًا.', requestId, 503);

  const ip = mobileClientIp(request);
  const allowed =
    (await checkRateLimit(`mobile-signin-ip:${ip}`, 12)) &&
    (await checkRateLimit(`mobile-signin:${ip}:${input.email}`, 8));
  if (!allowed)
    return mobileFailure(
      'RATE_LIMITED',
      'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
      requestId,
      429,
    );

  try {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        passwordHash: true,
        role: true,
        status: true,
        tokenVersion: true,
      },
    });
    const valid = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !valid || user.status !== 'ACTIVE') {
      return mobileFailure('INVALID_CREDENTIALS', genericMessage, requestId, 401);
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await createMobileSession(
      createPrismaMobileSessionRepository(),
      resolveMobileAuthSecret(),
      user,
      Date.now(),
      input.installationId && input.installationSecret
        ? {
            installationId: input.installationId,
            installationSecret: input.installationSecret,
          }
        : undefined,
    );
    return mobileSuccess(session, requestId);
  } catch {
    return mobileFailure('AUTH_FAILED', 'تعذّر تسجيل الدخول الآن. حاول لاحقًا.', requestId, 500);
  }
}
