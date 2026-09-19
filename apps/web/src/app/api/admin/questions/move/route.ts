import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';

const MOVE_LIMIT = 120;
const ONE_MINUTE_MS = 60_000;

const moveSchema = z.object({
  questionIds: z
    .array(z.string().trim().min(1).max(191))
    .min(1, 'اختر سؤالًا واحدًا على الأقل.')
    .max(200, 'الحد الأقصى 200 سؤال لكل عملية.'),
  categoryId: z.string().trim().max(191).nullable(),
});

const moveCategorySchema = z.object({
  categoryId: z.string().trim().min(1).max(191),
  parentId: z.string().trim().max(191).nullable(),
});

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function authorize(request: Request) {
  if (!hasDatabaseUrl()) {
    return { error: NextResponse.json({ ok: false, message: 'قاعدة البيانات غير مهيأة.' }, { status: 503 }) };
  }
  const session = await getCurrentSession();
  const sessionUser = session?.user;
  if (!sessionUser?.id || typeof sessionUser.tokenVersion !== 'number') {
    return { error: NextResponse.json({ ok: false, message: 'سجّل الدخول أولًا.' }, { status: 401 }) };
  }
  const storedUser = await getPrismaClient().user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!isSessionUserCurrent(sessionUser, storedUser)) {
    return { error: NextResponse.json({ ok: false, message: 'انتهت الجلسة.' }, { status: 401 }) };
  }
  if (!canManageQuestions(storedUser.role)) {
    return { error: NextResponse.json({ ok: false, message: 'لا تملك صلاحية إدارة الأسئلة.' }, { status: 403 }) };
  }
  return { user: storedUser, requestIp: getClientIp(request) };
}

function detectKind(body: unknown): 'questions' | 'category' | null {
  if (!body || typeof body !== 'object') return null;
  const keys = Object.keys(body as Record<string, unknown>);
  if (keys.includes('questionIds')) return 'questions';
  if (keys.includes('categoryId') && keys.includes('parentId')) return 'category';
  return null;
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const allowed = await checkRateLimit(
    `question-move:user:${auth.user.id}`,
    MOVE_LIMIT,
    ONE_MINUTE_MS,
  );
  if (!allowed) {
    return NextResponse.json({ ok: false, message: 'تجاوزت الحد المؤقت. حاول لاحقًا.' }, { status: 429 });
  }

  const raw = await request.json().catch(() => null);
  const kind = detectKind(raw);
  const prisma = getPrismaClient();

  if (kind === 'questions') {
    const parsed = moveSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'بيانات النقل غير صحيحة.' },
        { status: 400 },
      );
    }
    if (parsed.data.categoryId) {
      const exists = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
      if (!exists) {
        return NextResponse.json({ ok: false, message: 'التصنيف غير موجود.' }, { status: 400 });
      }
    }
    const result = await prisma.question.updateMany({
      where: { id: { in: parsed.data.questionIds } },
      data: {
        categoryId: parsed.data.categoryId,
        lastEditedAt: new Date(),
      },
    });
    return NextResponse.json(
      { ok: true, moved: result.count, targetCategoryId: parsed.data.categoryId },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (kind === 'category') {
    const parsed = moveCategorySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, message: parsed.error.issues[0]?.message ?? 'بيانات النقل غير صحيحة.' },
        { status: 400 },
      );
    }
    const { categoryId, parentId } = parsed.data;
    if (parentId === categoryId) {
      return NextResponse.json(
        { ok: false, message: 'لا يمكن جعل التصنيف أبًا لنفسه.' },
        { status: 400 },
      );
    }
    if (parentId) {
      const parent = await prisma.category.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ ok: false, message: 'التصنيف الأب غير موجود.' }, { status: 400 });
      }
    }
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const cat = await tx.category.findUnique({ where: { id: categoryId } });
        if (!cat) throw new Error('CATEGORY_NOT_FOUND');
        // Walk up the parent chain to ensure we don't create a cycle.
        let next: string | null = parentId;
        const seen = new Set<string>();
        while (next) {
          if (seen.has(next)) throw new Error('CATEGORY_CYCLE');
          seen.add(next);
          if (next === categoryId) throw new Error('CATEGORY_CYCLE');
          const row = await tx.category.findUnique({ where: { id: next }, select: { parentId: true } });
          next = row?.parentId ?? null;
        }
        return tx.category.update({ where: { id: categoryId }, data: { parentId } });
      });
      return NextResponse.json(
        { ok: true, category: { id: updated.id, parentId: updated.parentId } },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'CATEGORY_NOT_FOUND') {
        return NextResponse.json({ ok: false, message: 'التصنيف غير موجود.' }, { status: 404 });
      }
      if (message === 'CATEGORY_CYCLE') {
        return NextResponse.json(
          { ok: false, message: 'لا يمكن نقل التصنيف تحت أحد أبنائه.' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : 'تعذّر نقل التصنيف.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { ok: false, message: 'نوع العملية غير مدعوم. أرسل إما questionIds أو categoryId+parentId.' },
    { status: 400 },
  );
}
