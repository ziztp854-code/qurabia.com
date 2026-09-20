import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { requireMobileUser } from '@/lib/mobile-auth/authorization';
import { mobileFailure, mobileRequestId, mobileSuccess } from '@/lib/mobile-auth/http';
import { createDefaultMobileProfileService, MobileProfileError } from '@/lib/mobile-profile';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const requestId = mobileRequestId(request);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الحسابات غير متاحة حاليًا.', requestId, 503);
  const user = await requireMobileUser(request);
  if (!user)
    return mobileFailure('UNAUTHORIZED', 'يلزم تسجيل الدخول لعرض الملف الشخصي.', requestId, 401);
  if (!(await checkRateLimit(`mobile-profile:${user.id}`, 60, 60_000))) {
    return mobileFailure('RATE_LIMITED', 'طلبات كثيرة. حاول بعد قليل.', requestId, 429);
  }
  try {
    return mobileSuccess(await createDefaultMobileProfileService().getProfile(user.id), requestId);
  } catch (error) {
    if (error instanceof MobileProfileError) {
      return mobileFailure(error.code, error.message, requestId, error.status);
    }
    return mobileFailure('PROFILE_FAILED', 'تعذّر تحميل الملف الشخصي الآن.', requestId, 500);
  }
}
