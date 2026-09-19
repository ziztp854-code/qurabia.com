import { NextResponse } from 'next/server';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { questionUpdateSchema, validateQuestionRow } from '@/lib/questions/validation';
import { clampKeywords, MAX_KEYWORDS_PER_QUESTION } from '@/lib/questions/keywords';
import { Prisma } from '@tahaddi/database';

const UPDATE_LIMIT = 120;
const ONE_MINUTE_MS = 60_000;

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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authorize(_request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const prisma = getPrismaClient();
  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      options: { orderBy: { position: 'asc' } },
      tags: true,
      category: { select: { id: true, name: true, slug: true, parentId: true } },
    },
  });
  if (!question) {
    return NextResponse.json({ ok: false, message: 'السؤال غير موجود.' }, { status: 404 });
  }
  const correctIndex = question.options.findIndex((opt) => opt.isCorrect);
  const issues = validateQuestionRow({
    type: question.type,
    prompt: question.prompt,
    options: question.options.map((opt) => ({ text: opt.text, isCorrect: opt.isCorrect })),
    correctOption: correctIndex,
    expectedAnswer: question.expectedAnswer,
    timeLimit: question.timeLimit,
    basePoints: question.basePoints,
    difficulty: question.difficulty,
    gameTypes: question.gameTypes,
    keywords: question.keywords,
    categoryId: question.categoryId,
    status: question.status,
  });
  return NextResponse.json(
    {
      ok: true,
      question: {
        id: question.id,
        type: question.type,
        status: question.status,
        difficulty: question.difficulty,
        prompt: question.prompt,
        explanation: question.explanation,
        expectedAnswer: question.expectedAnswer,
        keywords: question.keywords,
        gameTypes: question.gameTypes,
        source: question.source,
        timeLimit: question.timeLimit,
        basePoints: question.basePoints,
        version: question.version,
        lastEditedAt: question.lastEditedAt,
        category: question.category,
        tags: question.tags.map((t) => t.tag),
        options: question.options,
        correctOption: correctIndex,
      },
      issues,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const allowed = await checkRateLimit(
    `question-update:user:${auth.user.id}`,
    UPDATE_LIMIT,
    ONE_MINUTE_MS,
  );
  if (!allowed) {
    return NextResponse.json({ ok: false, message: 'تجاوزت الحد المؤقت. حاول لاحقًا.' }, { status: 429 });
  }
  const prisma = getPrismaClient();
  const existing = await prisma.question.findUnique({
    where: { id },
    include: { options: { orderBy: { position: 'asc' } } },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, message: 'السؤال غير موجود.' }, { status: 404 });
  }
  const parsed = questionUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'بيانات التحديث غير صحيحة.' },
      { status: 400 },
    );
  }
  if (parsed.data.version !== existing.version) {
    return NextResponse.json(
      {
        ok: false,
        message: 'تم تعديل هذا السؤال من مستخدم آخر. أعد تحميل الصفحة قبل المتابعة.',
        currentVersion: existing.version,
      },
      { status: 409 },
    );
  }
  const data = parsed.data;
  if (data.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!cat) {
      return NextResponse.json({ ok: false, message: 'التصنيف غير موجود.' }, { status: 400 });
    }
  }

  let normalizedKeywords: string[] | undefined;
  if (data.keywords) {
    const clamped = clampKeywords(data.keywords);
    if (clamped.length > MAX_KEYWORDS_PER_QUESTION) {
      return NextResponse.json(
        { ok: false, message: 'الحد الأقصى 12 كلمة مفتاحية للسؤال.' },
        { status: 400 },
      );
    }
    normalizedKeywords = clamped;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.question.update({
        where: { id, version: existing.version },
        data: {
          ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
          ...(data.explanation !== undefined ? { explanation: data.explanation } : {}),
          ...(data.expectedAnswer !== undefined ? { expectedAnswer: data.expectedAnswer } : {}),
          ...(data.difficulty !== undefined ? { difficulty: data.difficulty } : {}),
          ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
          ...(data.gameTypes !== undefined ? { gameTypes: data.gameTypes } : {}),
          ...(data.source !== undefined ? { source: data.source } : {}),
          ...(data.timeLimit !== undefined ? { timeLimit: data.timeLimit } : {}),
          ...(data.basePoints !== undefined ? { basePoints: data.basePoints } : {}),
          ...(normalizedKeywords !== undefined ? { keywords: normalizedKeywords } : {}),
          version: { increment: 1 },
          lastEditedAt: new Date(),
        },
      });
      if (normalizedKeywords !== undefined) {
        await tx.questionTag.deleteMany({ where: { questionId: id } });
        if (normalizedKeywords.length > 0) {
          await tx.questionTag.createMany({
            data: normalizedKeywords.map((tag) => ({
            questionId: id,
            tag,
          })),
            skipDuplicates: true,
          });
        }
      }
      if (data.options && data.options.length > 0 && existing.type !== 'SHORT_ANSWER') {
        const newOptions = data.options;
        const correctIndex = data.correctOption ?? 0;
        await tx.questionOption.deleteMany({ where: { questionId: id } });
        await tx.questionOption.createMany({
          data: newOptions.map((text, position) => ({
            questionId: id,
            position,
            text,
            isCorrect: position === correctIndex,
          })),
        });
      }
      return result;
    });
    return NextResponse.json(
      { ok: true, id: updated.id, version: updated.version },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json(
        { ok: false, message: 'تم تعديل هذا السؤال من مستخدم آخر. أعد تحميل الصفحة.' },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : 'تعذّر تحديث السؤال.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const prisma = getPrismaClient();
  const usage = await prisma.quizQuestion.count({ where: { questionId: id } });
  if (usage > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: `السؤال مستخدم في ${usage} مسابقة. احذفه من المسابقات أولًا.`,
      },
      { status: 400 },
    );
  }
  try {
    await prisma.question.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر حذف السؤال.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
