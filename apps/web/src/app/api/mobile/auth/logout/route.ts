import { z } from 'zod';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import {
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
  parseMobileJson,
} from '@/lib/mobile-auth/http';
import { createPrismaMobileSessionRepository } from '@/lib/mobile-auth/prisma-session-repository';
import { revokeMobileSessionWithPushDevice } from '@/lib/mobile-auth/session-service';
import { expoPushTokenSchema } from '@/lib/mobile-notifications/device-registration';
import {
  installationIdSchema,
  installationSecretSchema,
  registrationRevisionSchema,
} from '@/lib/mobile-notifications/installation-capability';

export const runtime = 'nodejs';

const inputSchema = z
  .object({
    refreshToken: z.string().min(40).max(256),
    sessionId: z.string().min(1).max(128).optional(),
    expoPushToken: expoPushTokenSchema.optional(),
    installationId: installationIdSchema.optional(),
    installationSecret: installationSecretSchema.optional(),
    registrationRevision: registrationRevisionSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const capabilityValues = [value.sessionId, value.installationId, value.installationSecret];
    const capabilityCount = capabilityValues.filter((item) => item !== undefined).length;
    const pushCount = [value.expoPushToken, value.registrationRevision].filter(
      (item) => item !== undefined,
    ).length;
    const legacy = value.expoPushToken !== undefined && capabilityCount === 0 && pushCount === 1;
    const capability = capabilityCount === capabilityValues.length && pushCount === 0;
    const capabilityWithPush = capabilityCount === capabilityValues.length && pushCount === 2;
    const empty = capabilityCount === 0 && pushCount === 0;
    if (!empty && !legacy && !capability && !capabilityWithPush) {
      context.addIssue({ code: 'custom', message: 'Complete installation cleanup is required.' });
    }
  });

export async function POST(request: Request) {
  const requestId = mobileRequestId(request);
  const input = await parseMobileJson(request, inputSchema);
  if (!input) return mobileFailure('INVALID_REQUEST', 'طلب تسجيل الخروج غير صالح.', requestId, 400);

  if (hasDatabaseUrl()) {
    try {
      const pushRegistrationDisabled = await revokeMobileSessionWithPushDevice(
        createPrismaMobileSessionRepository(),
        input.refreshToken,
        input.sessionId
          ? {
              sessionId: input.sessionId,
              installationId: input.installationId!,
              installationSecret: input.installationSecret!,
              ...(input.expoPushToken && input.registrationRevision
                ? {
                    expoPushToken: input.expoPushToken,
                    registrationRevision: input.registrationRevision,
                  }
                : {}),
            }
          : input.expoPushToken
            ? { expoPushToken: input.expoPushToken }
            : undefined,
      );
      return mobileSuccess({ signedOut: true as const, pushRegistrationDisabled }, requestId);
    } catch {
      return mobileFailure('LOGOUT_FAILED', 'تعذّر تسجيل الخروج الآن.', requestId, 500);
    }
  }
  return mobileSuccess(
    {
      signedOut: true as const,
      pushRegistrationDisabled: input.expoPushToken === undefined,
    },
    requestId,
  );
}
