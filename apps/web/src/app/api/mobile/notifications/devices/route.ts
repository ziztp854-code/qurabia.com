import { checkRateLimit } from '@/lib/auth/rate-limit';
import { requireMobileUser } from '@/lib/mobile-auth/authorization';
import {
  mobileClientIp,
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
  parseMobileJson,
} from '@/lib/mobile-auth/http';
import {
  mobilePushDeviceRemovalSchema,
  mobilePushDeviceSchema,
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from '@/lib/mobile-notifications/device-registration';
import {
  createPrismaMobilePushDeviceRepository,
  InvalidInstallationCapabilityError,
  PushRegistrationConflictError,
} from '@/lib/mobile-notifications/prisma-device-repository';

export const runtime = 'nodejs';

async function authenticatedRequest(request: Request, requestId: string) {
  const user = await requireMobileUser(request);
  if (!user) {
    return {
      response: mobileFailure('UNAUTHORIZED', 'سجّل الدخول لإدارة الإشعارات.', requestId, 401),
      user: null,
    };
  }

  const allowed = await checkRateLimit(
    `mobile-push-device:${user.id}:${mobileClientIp(request)}`,
    20,
    15 * 60_000,
  );
  return allowed
    ? { response: null, user }
    : {
        response: mobileFailure(
          'RATE_LIMITED',
          'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
          requestId,
          429,
        ),
        user: null,
      };
}

export async function POST(request: Request) {
  const requestId = mobileRequestId(request);
  const auth = await authenticatedRequest(request, requestId);
  if (auth.response || !auth.user) return auth.response;

  const input = await parseMobileJson(request, mobilePushDeviceSchema);
  if (!input) {
    return mobileFailure('INVALID_DEVICE', 'بيانات جهاز الإشعارات غير صالحة.', requestId, 400);
  }

  try {
    const registered = await registerMobilePushDevice(
      createPrismaMobilePushDeviceRepository(),
      auth.user.id,
      input,
    );
    return mobileSuccess(
      { registered: true as const, registrationRevision: registered.registrationRevision },
      requestId,
    );
  } catch (error) {
    if (
      error instanceof PushRegistrationConflictError ||
      error instanceof InvalidInstallationCapabilityError
    ) {
      return mobileFailure(
        'DEVICE_OWNERSHIP_CONFLICT',
        'تعذّر إثبات ملكية تسجيل الإشعارات لهذا الجهاز.',
        requestId,
        409,
      );
    }
    return mobileFailure('REGISTRATION_FAILED', 'تعذّر تفعيل الإشعارات الآن.', requestId, 500);
  }
}

export async function DELETE(request: Request) {
  const requestId = mobileRequestId(request);
  const auth = await authenticatedRequest(request, requestId);
  if (auth.response || !auth.user) return auth.response;

  const input = await parseMobileJson(request, mobilePushDeviceRemovalSchema);
  if (!input) {
    return mobileFailure('INVALID_DEVICE', 'بيانات جهاز الإشعارات غير صالحة.', requestId, 400);
  }

  try {
    const disabled = await unregisterMobilePushDevice(
      createPrismaMobilePushDeviceRepository(),
      auth.user.id,
      input,
    );
    if (!disabled && input.installationId) {
      return mobileFailure(
        'STALE_REGISTRATION',
        'تغيّر تسجيل الإشعارات على هذا الجهاز. حدّث الحالة ثم حاول مجددًا.',
        requestId,
        409,
      );
    }
    return mobileSuccess({ registered: false as const }, requestId);
  } catch {
    return mobileFailure('UNREGISTER_FAILED', 'تعذّر إلغاء الإشعارات الآن.', requestId, 500);
  }
}
