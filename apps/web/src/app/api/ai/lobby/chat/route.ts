import { NextResponse } from 'next/server';
import {
  askLobbyAssistant,
  LobbyAssistantError,
  lobbyAssistantInputSchema,
} from '@/lib/ai/lobby-assistant';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_BODY_BYTES = 6_000;

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function readBoundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return { tooLarge: false, value: null } as const;
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      return { tooLarge: true, value: null } as const;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      tooLarge: false,
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
    } as const;
  } catch {
    return { tooLarge: false, value: null } as const;
  }
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get('origin');
  if (!requestOrigin || requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, message: 'الطلب غير مسموح.' }, { status: 403 });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, message: 'الطلب أكبر من الحد المسموح.' },
      { status: 413 },
    );
  }
  const body = await readBoundedJson(request);
  if (body.tooLarge) {
    return NextResponse.json(
      { ok: false, message: 'الطلب أكبر من الحد المسموح.' },
      { status: 413 },
    );
  }
  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { ok: false, message: 'قاعدة البيانات غير مهيأة بعد.' },
      { status: 503 },
    );
  }

  const session = await getCurrentSession();
  const sessionUser = session?.user;
  if (!sessionUser?.id || typeof sessionUser.tokenVersion !== 'number') {
    return NextResponse.json({ ok: false, message: 'سجّل الدخول أولًا.' }, { status: 401 });
  }
  const storedUser = await getPrismaClient().user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(sessionUser, storedUser)) {
    return NextResponse.json(
      { ok: false, message: 'انتهت الجلسة. سجّل الدخول مجددًا.' },
      { status: 401 },
    );
  }
  if (storedUser?.status && storedUser.status !== 'ACTIVE') {
    return NextResponse.json(
      { ok: false, message: 'الحساب غير مفعّل حاليًا.' },
      { status: 403 },
    );
  }

  const parsed = lobbyAssistantInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message || 'راجع بيانات المحادثة.' },
      { status: 400 },
    );
  }

  const requestIp = getClientIp(request);
  // The assistant is conversational and the player can ask many
  // questions per session, so the per-minute budget is wider than
  // for the generation routes. Daily caps stay conservative to
  // bound the cost of the underlying xAI/Gateway calls.
  const allowed =
    (await checkRateLimit(`ai-lobby-user:${sessionUser.id}`, 10, MINUTE)) &&
    (await checkRateLimit(`ai-lobby-ip:${requestIp}`, 30, HOUR)) &&
    (await checkRateLimit('ai-lobby-global:daily', 1500, DAY));
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: 'تجاوزت الحد المسموح من الرسائل.' },
      { status: 429 },
    );
  }

  try {
    const response = await askLobbyAssistant(parsed.data);
    return NextResponse.json(
      { ok: true, ...response },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const known = error instanceof LobbyAssistantError ? error : null;
    return NextResponse.json(
      { ok: false, message: known?.message || 'تعذّر الحصول على رد الآن.' },
      { status: known?.code === 'CONFIG' ? 503 : 502 },
    );
  }
}
