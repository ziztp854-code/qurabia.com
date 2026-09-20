import { hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import {
  mobileClientIp,
  mobileFailure,
  mobileRequestId,
  mobileSuccess,
} from '@/lib/mobile-auth/http';
import { createDefaultMobileRoomsService, MobileRoomsError } from '@/lib/mobile-rooms';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ roomCode: string }> }) {
  const requestId = mobileRequestId(request);
  const { roomCode } = await params;
  if (!hasDatabaseUrl())
    return mobileFailure('SERVICE_UNAVAILABLE', 'خدمة الغرف غير متاحة حاليًا.', requestId, 503);
  if (
    !(await checkRateLimit(`mobile-room-read:${mobileClientIp(request)}:${roomCode}`, 90, 60_000))
  ) {
    return mobileFailure('RATE_LIMITED', 'طلبات كثيرة. حاول بعد قليل.', requestId, 429);
  }
  try {
    const room = await createDefaultMobileRoomsService().readRoom(roomCode);
    return mobileSuccess(room, requestId);
  } catch (error) {
    if (error instanceof MobileRoomsError) {
      return mobileFailure(error.code, error.message, requestId, error.status);
    }
    return mobileFailure('ROOM_READ_FAILED', 'تعذّر تحميل الغرفة الآن.', requestId, 500);
  }
}
