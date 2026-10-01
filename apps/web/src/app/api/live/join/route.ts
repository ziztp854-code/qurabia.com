import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { hasDatabaseUrl } from '@/lib/auth/prisma';
import {
  isUniqueConstraintError,
  joinQuizSessionByCode,
  normalizePlayerName,
} from '@/lib/live/join-quiz-session';
import { isRoomCode, normalizeRoomCode } from '@/lib/quiz/room-code';

const JOIN_LIMIT = 20;
const JOIN_WINDOW_MS = 60 * 1000;

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function failure(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(request: Request) {
  const allowed = await checkRateLimit(
    `live-join:${getClientIp(request)}`,
    JOIN_LIMIT,
    JOIN_WINDOW_MS,
  );
  if (!allowed) {
    return failure(429, 'RATE_LIMITED', 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.');
  }

  const body = (await request.json().catch(() => null)) as {
    roomCode?: unknown;
    playerName?: unknown;
  } | null;
  const roomCode = normalizeRoomCode(typeof body?.roomCode === 'string' ? body.roomCode : '');
  const displayName = normalizePlayerName(
    typeof body?.playerName === 'string' ? body.playerName : '',
  );

  if (!isRoomCode(roomCode)) {
    return failure(400, 'INVALID_ROOM_CODE', 'الرمز يجب أن يتكوّن من 6 إلى 8 أحرف أو أرقام صالحة.');
  }
  if (displayName.length < 2) {
    return failure(400, 'INVALID_PLAYER_NAME', 'اكتب اسمًا من حرفين على الأقل للانضمام.');
  }
  if (!hasDatabaseUrl()) {
    return failure(503, 'UNAVAILABLE', 'خدمة الجلسات المباشرة غير متاحة حاليًا.');
  }

  try {
    const result = await joinQuizSessionByCode(roomCode, displayName);
    if (result.status === 'not_found') {
      return failure(404, 'ROOM_NOT_FOUND', 'لم نجد مسابقة مفتوحة بهذا الرمز.');
    }
    if (result.status === 'full') {
      return failure(409, 'ROOM_FULL', 'اكتمل عدد اللاعبين المسموح به في هذه الغرفة.');
    }
    return NextResponse.json({
      ok: true,
      sessionId: result.sessionId,
      participantId: result.participantId,
      participantToken: result.participantToken,
      roomCode: result.roomCode,
      displayName,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return failure(409, 'NAME_TAKEN', 'هذا الاسم مستخدم في الغرفة. اختر اسمًا آخر.');
    }
    return failure(500, 'JOIN_FAILED', 'تعذّر الانضمام الآن. حاول مرة أخرى.');
  }
}
