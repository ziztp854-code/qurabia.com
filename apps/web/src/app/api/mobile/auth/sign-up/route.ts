import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { hashPassword } from '@/lib/auth/password';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { signUpSchema } from '@/lib/auth/validation';
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

const inputSchema = signUpSchema
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

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
}

export async function POST(request: Request) {
  const requestId = mobileRequestId(request);
  const input = await parseMobileJson(request, inputSchema);
  if (!input)
    return mobileFailure('INVALID_REQUEST', 'راجع الاسم والبريد وكلمة المرور.', requestId, 400);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الحسابات غير متاحة حاليًا.', requestId, 503);

  const ip = mobileClientIp(request);
  const allowed =
    (await checkRateLimit(`mobile-signup-ip:${ip}`, 5)) &&
    (await checkRateLimit(`mobile-signup:${ip}:${input.email}`, 5));
  if (!allowed)
    return mobileFailure(
      'RATE_LIMITED',
      'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
      requestId,
      429,
    );

  try {
    const prisma = getPrismaClient();
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing)
      return mobileFailure(
        'ACCOUNT_UNAVAILABLE',
        'تعذّر إنشاء الحساب بهذه البيانات.',
        requestId,
        409,
      );

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        status: 'ACTIVE',
        profile: { create: { displayName: input.name } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        status: true,
        tokenVersion: true,
      },
    });
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
    return mobileSuccess(session, requestId, 201);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return mobileFailure(
        'ACCOUNT_UNAVAILABLE',
        'تعذّر إنشاء الحساب بهذه البيانات.',
        requestId,
        409,
      );
    }
    return mobileFailure('SIGNUP_FAILED', 'تعذّر إنشاء الحساب الآن. حاول لاحقًا.', requestId, 500);
  }
}
