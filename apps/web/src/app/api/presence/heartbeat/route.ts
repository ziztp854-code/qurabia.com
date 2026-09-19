import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { isVisitorId, recordPresenceHeartbeat } from '@/lib/presence/presence-store';

const HEARTBEAT_LIMIT = 20;
const HEARTBEAT_WINDOW_MS = 5 * 60 * 1000;

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const allowed = await checkRateLimit(
    `presence-heartbeat:${getClientIp(request)}`,
    HEARTBEAT_LIMIT,
    HEARTBEAT_WINDOW_MS,
  );
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const visitorId = body && typeof body === 'object' ? Reflect.get(body, 'visitorId') : null;
  if (!isVisitorId(visitorId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await recordPresenceHeartbeat(visitorId);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
