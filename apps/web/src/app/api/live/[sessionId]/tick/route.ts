import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { advanceLiveSessionIfDue } from '@/lib/live/engine';

const TICK_LIMIT = 120;
const TICK_WINDOW_MS = 60 * 1000;

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const allowed = await checkRateLimit(
    `live-tick:${getClientIp(request)}`,
    TICK_LIMIT,
    TICK_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { sessionId } = await params;
  await advanceLiveSessionIfDue(sessionId);
  return NextResponse.json({ ok: true, serverTime: Date.now() });
}
