import { NextResponse } from 'next/server';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { questionSchema, validateQuestionRow, type QuestionRowForValidation } from '@/lib/questions/validation';
import { clampKeywords } from '@/lib/questions/keywords';

async function authorize() {
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
  return { user: storedUser };
}

export async function POST(request: Request) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        message: parsed.error.issues[0]?.message ?? 'بيانات السؤال غير صحيحة.',
        issues: parsed.error.issues.map((issue) => ({
          level: 'error',
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const keywords = clampKeywords(data.keywords ?? []);

  // Detect duplicate questions (same prompt + same category)
  const prisma = getPrismaClient();
  const duplicates = await prisma.question.findMany({
    where: {
      prompt: { equals: data.prompt, mode: 'insensitive' },
      ...(data.categoryId ? { categoryId: data.categoryId } : { categoryId: null }),
    },
    select: { id: true, status: true, prompt: true },
    take: 5,
  });

  const rowForValidation: QuestionRowForValidation = {
    type: data.type,
    prompt: data.prompt,
    options: data.options.map((text, position) => ({
      text,
      isCorrect: position === data.correctOption,
    })),
    correctOption: data.correctOption,
    expectedAnswer: data.expectedAnswer ?? null,
    timeLimit: data.timeLimit,
    basePoints: data.basePoints,
    difficulty: data.difficulty,
    gameTypes: data.gameTypes,
    keywords,
    categoryId: data.categoryId ?? null,
    status: 'DRAFT',
  };
  const issues = validateQuestionRow(rowForValidation);

  // Check whether the category exists, if specified.
  if (data.categoryId) {
    const exists = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!exists) {
      issues.push({
        level: 'error',
        path: 'categoryId',
        message: 'التصنيف غير موجود.',
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      normalized: {
        ...data,
        keywords,
      },
      issues,
      duplicates: duplicates.map((d) => ({
        id: d.id,
        status: d.status,
        prompt: d.prompt,
      })),
      hasErrors: issues.some((issue) => issue.level === 'error'),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
