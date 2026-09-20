import { z } from 'zod';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { getOptionalMobileUser } from '@/lib/mobile-auth/authorization';
import {
  mobileClientIp,
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
  parseMobileJson,
} from '@/lib/mobile-auth/http';
import { createDefaultMobileRoomsService, MobileRoomsError } from '@/lib/mobile-rooms';

export const runtime = 'nodejs';

const joinSchema = z.object({ displayName: z.string().trim().min(2).max(80) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomCode: string }> },
) {
  const requestId = mobileRequestId(request);
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الغرف غير متاحة حاليًا.', requestId, 503);
  const { roomCode } = await params;
  const user = await getOptionalMobileUser(request);
  if (request.headers.has('authorization') && !user) {
    return mobileFailure('UNAUTHORIZED', 'انتهت الجلسة. سجّل الدخول مجددًا.', requestId, 401);
  }
  if (
    !(await checkRateLimit(`mobile-room-join:${mobileClientIp(request)}:${roomCode}`, 15, 60_000))
  ) {
    return mobileFailure(
      'RATE_LIMITED',
      'محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
      requestId,
      429,
    );
  }
  const input = await parseMobileJson(request, joinSchema);
  if (!input)
    return mobileFailure('INVALID_REQUEST', 'اكتب اسمًا صالحًا للانضمام.', requestId, 400);
  try {
    const result = await createDefaultMobileRoomsService().joinRoom({
      roomCode,
      displayName: input.displayName,
      userId: user?.id,
    });
    return mobileSuccess(result, requestId, 201);
  } catch (error) {
    if (error instanceof MobileRoomsError) {
      return mobileFailure(error.code, error.message, requestId, error.status);
    }
    return mobileFailure('ROOM_JOIN_FAILED', 'تعذّر الانضمام الآن. حاول مجددًا.', requestId, 500);
  }
}
