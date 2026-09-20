import { z } from 'zod';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { requireMobileUser } from '@/lib/mobile-auth/authorization';
import {
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
  parseMobileJson,
} from '@/lib/mobile-auth/http';
import { createDefaultMobileRoomsService, MobileRoomsError } from '@/lib/mobile-rooms';

export const runtime = 'nodejs';

const createRoomSchema = z.object({ quizId: z.string().trim().min(1).max(128) }).strict();

function failureFrom(error: unknown, requestId: string) {
  if (error instanceof MobileRoomsError) {
    return mobileFailure(error.code, error.message, requestId, error.status);
  }
  return mobileFailure('ROOMS_FAILED', 'تعذّر إكمال طلب الغرفة الآن.', requestId, 500);
}

export async function GET(request: Request) {
  const requestId = mobileRequestId(request);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الغرف غير متاحة حاليًا.', requestId, 503);
  const user = await requireMobileUser(request);
  if (!user)
    return mobileFailure('UNAUTHORIZED', 'يلزم تسجيل الدخول لعرض مسابقاتك.', requestId, 401);
  if (!(await checkRateLimit(`mobile-rooms-list:${user.id}`, 60, 60_000))) {
    return mobileFailure('RATE_LIMITED', 'طلبات كثيرة. حاول بعد قليل.', requestId, 429);
  }
  try {
    const quizzes = await createDefaultMobileRoomsService().listHostQuizzes(user.id);
    return mobileSuccess({ quizzes }, requestId);
  } catch (error) {
    return failureFrom(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = mobileRequestId(request);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الغرف غير متاحة حاليًا.', requestId, 503);
  const user = await requireMobileUser(request);
  if (!user) return mobileFailure('UNAUTHORIZED', 'يلزم تسجيل الدخول لإنشاء غرفة.', requestId, 401);
  if (!(await checkRateLimit(`mobile-rooms-create:${user.id}`, 12, 60_000))) {
    return mobileFailure('RATE_LIMITED', 'طلبات كثيرة. حاول بعد قليل.', requestId, 429);
  }
  const input = await parseMobileJson(request, createRoomSchema);
  if (!input) return mobileFailure('INVALID_REQUEST', 'اختر مسابقة صالحة.', requestId, 400);
  try {
    const result = await createDefaultMobileRoomsService().createRoom({
      user,
      quizId: input.quizId,
    });
    return mobileSuccess(result, requestId, 201);
  } catch (error) {
    return failureFrom(error, requestId);
  }
}
