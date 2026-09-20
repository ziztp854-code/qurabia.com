import { z } from 'zod';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import {
  mobileClientIp,
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
  parseMobileJson,
} from '@/lib/mobile-auth/http';
import { createPrismaMobileSessionRepository } from '@/lib/mobile-auth/prisma-session-repository';
import { rotateMobileSession } from '@/lib/mobile-auth/session-service';
import { hashMobileRefreshToken, resolveMobileAuthSecret } from '@/lib/mobile-auth/tokens';

export const runtime = 'nodejs';

const inputSchema = z.object({ refreshToken: z.string().min(40).max(256) }).strict();

export async function POST(request: Request) {
  const requestId = mobileRequestId(request);
  const input = await parseMobileJson(request, inputSchema);
  if (!input) return mobileFailure('INVALID_REQUEST', 'طلب تحديث الجلسة غير صالح.', requestId, 400);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الحسابات غير متاحة حاليًا.', requestId, 503);

  const ip = mobileClientIp(request);
  const fingerprint = hashMobileRefreshToken(input.refreshToken).slice(-24);
  if (!(await checkRateLimit(`mobile-refresh:${ip}:${fingerprint}`, 20, 15 * 60_000))) {
    return mobileFailure(
      'RATE_LIMITED',
      'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
      requestId,
      429,
    );
  }

  try {
    const session = await rotateMobileSession(
      createPrismaMobileSessionRepository(),
      resolveMobileAuthSecret(),
      input.refreshToken,
    );
    return session
      ? mobileSuccess(session, requestId)
      : mobileFailure('SESSION_EXPIRED', 'انتهت الجلسة. سجّل الدخول من جديد.', requestId, 401);
  } catch {
    return mobileFailure('REFRESH_FAILED', 'تعذّر تحديث الجلسة الآن.', requestId, 500);
  }
}
