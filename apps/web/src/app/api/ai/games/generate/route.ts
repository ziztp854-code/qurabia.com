import { NextResponse } from 'next/server';
import { createAiGameDraftToken } from '@tahaddi/contracts';
import {
  GameContentGenerationError,
  gameContentInputSchema,
  generateGameContentDraft,
} from '@/lib/ai/game-content-generation';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { consumeQuota } from '@/lib/subscription/entitlements';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_BODY_BYTES = 8_192;
const DRAFT_TTL_MS = 10 * MINUTE;

function approvalContent(draft: Awaited<ReturnType<typeof generateGameContentDraft>>) {
  if (draft.game === 'mafia') return draft.content;
  return {
    mode: draft.game,
    rounds: draft.content.rounds.map((round, index) => ({
      ...round,
      id: `grok-${draft.game}-${index + 1}`,
    })),
  };
}

async function readBoundedJson(request: Request) {
  if (!request.body) return { tooLarge: false, value: null } as const;

  const reader = request.body.getReader();
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
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
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
  const parsed = gameContentInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message || 'راجع بيانات التوليد.' },
      { status: 400 },
    );
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const planQuota = await consumeQuota(storedUser.id, 'aiQuestionsPerMonth', storedUser.role);
  if (!planQuota.ok) {
    return NextResponse.json({ ok: false, message: planQuota.message }, { status: 402 });
  }
  const allowed =
    (await checkRateLimit(`ai-game-user:${sessionUser.id}`, 3, MINUTE)) &&
    (await checkRateLimit(`ai-game-ip:${ip}`, 15, HOUR)) &&
    (await checkRateLimit('ai-game-global:daily', 250, DAY));
  if (!allowed) {
    return NextResponse.json(
      { ok: false, message: 'بلغت الحد المؤقت. حاول لاحقًا.' },
      { status: 429 },
    );
  }
  try {
    const draft = await generateGameContentDraft(parsed.data);
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';
    const approvalToken = createAiGameDraftToken(secret, {
      game: draft.game,
      content: approvalContent(draft),
      expiresAt: Date.now() + DRAFT_TTL_MS,
    });
    return NextResponse.json(
      { ok: true, draft, approvalToken },
      { headers: { 'cache-control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const known = error instanceof GameContentGenerationError ? error : null;
    return NextResponse.json(
      { ok: false, message: known?.message || 'تعذّر توليد المحتوى الآن.' },
      { status: known?.code === 'CONFIG' ? 503 : 502 },
    );
  }
}
