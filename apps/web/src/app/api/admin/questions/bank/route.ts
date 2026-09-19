import { NextResponse } from 'next/server';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { questionSchema } from '@/lib/questions/validation';
import {
  buildQuestionWhere,
  parseQuestionBankFilters,
  type QuestionBankFilters,
} from '@/lib/questions/admin-filters';
import { loadCategorySubtreeIds, categoryScopeNeedsSubtree } from '@/lib/questions/category-scope';
import { clampKeywords, keywordContainsFilter } from '@/lib/questions/keywords';
import { Prisma } from '@tahaddi/database';

const PAGE_SIZE = 25;
const MAX_PAGE = 100_000;
const CREATE_LIMIT = 60;
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

async function buildCategoryContext(filters: QuestionBankFilters) {
  if (!categoryScopeNeedsSubtree(filters.category, filters.includeDescendants)) {
    return undefined;
  }
  return loadCategorySubtreeIds(getPrismaClient(), filters.category);
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const url = new URL(request.url);
  const filters = parseQuestionBankFilters({
    category: url.searchParams.get('category') ?? undefined,
    q: url.searchParams.get('q') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    difficulty: url.searchParams.get('difficulty') ?? undefined,
    type: url.searchParams.get('type') ?? undefined,
    game: url.searchParams.get('game') ?? undefined,
    time: url.searchParams.get('time') ?? undefined,
    keyword: url.searchParams.get('keyword') ?? undefined,
    page: url.searchParams.get('page') ?? undefined,
    includeDescendants: url.searchParams.get('includeDescendants') ?? undefined,
  });
  const pageSize = Math.min(
    Math.max(1, Number.parseInt(url.searchParams.get('pageSize') ?? '0', 10) || PAGE_SIZE),
    100,
  );
  const categoryIds = await buildCategoryContext(filters);
  const keywordFilter = keywordContainsFilter(filters.keyword);
  const where = buildQuestionWhere(
    keywordFilter ? { ...filters, keyword: keywordFilter } : { ...filters, keyword: '' },
    { categoryIds },
  );
  const prisma = getPrismaClient();
  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      // `id` breaks ties so pagination stays stable when questions share
      // the same lastEditedAt second.
      orderBy: [{ lastEditedAt: 'desc' }, { id: 'asc' }],
      skip: (Math.min(filters.page, MAX_PAGE) - 1) * pageSize,
      take: pageSize,
      include: {
        options: { orderBy: { position: 'asc' } },
        category: { select: { id: true, name: true } },
        tags: true,
        _count: { select: { tags: true, quizzes: true } },
      },
    }),
  ]);
  return NextResponse.json(
    {
      ok: true,
      filters,
      total,
      page: filters.page,
      pageSize,
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        status: q.status,
        difficulty: q.difficulty,
        prompt: q.prompt,
        explanation: q.explanation,
        expectedAnswer: q.expectedAnswer,
        keywords: q.keywords,
        gameTypes: q.gameTypes,
        source: q.source,
        timeLimit: q.timeLimit,
        basePoints: q.basePoints,
        version: q.version,
        lastEditedAt: q.lastEditedAt,
        category: q.category,
        tags: q.tags.map((t) => t.tag),
        options: q.options,
        usageCount: q._count.quizzes,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const allowed = await checkRateLimit(
    `question-create:user:${auth.user.id}`,
    CREATE_LIMIT,
    ONE_MINUTE_MS,
  );
  if (!allowed) {
    return NextResponse.json({ ok: false, message: 'تجاوزت الحد المؤقت. حاول لاحقًا.' }, { status: 429 });
  }
  const parsed = questionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'بيانات السؤال غير صحيحة.' },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const keywords = clampKeywords(data.keywords ?? []);
  const prisma = getPrismaClient();
  if (data.categoryId) {
    const exists = await prisma.category.findUnique({ where: { id: data.categoryId } });
    if (!exists) {
      return NextResponse.json({ ok: false, message: 'التصنيف غير موجود.' }, { status: 400 });
    }
  }
  try {
    const created = await prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          ownerId: auth.user.id,
          type: data.type,
          status: 'DRAFT',
          difficulty: data.difficulty,
          prompt: data.prompt,
          explanation: data.explanation ?? null,
          expectedAnswer: data.expectedAnswer ?? null,
          keywords,
          categoryId: data.categoryId ?? null,
          gameTypes: data.gameTypes,
          source: data.source ?? null,
          timeLimit: data.timeLimit,
          basePoints: data.basePoints,
        },
      });
      if (data.type === 'SHORT_ANSWER') {
        // no options for short answer
      } else {
        const options = data.options.map((text, position) => ({
          questionId: question.id,
          position,
          text,
          isCorrect: position === data.correctOption,
        }));
        if (options.length > 0) {
          await tx.questionOption.createMany({ data: options });
        }
      }
      if (keywords.length > 0) {
        await tx.questionTag.createMany({
          data: keywords.map((tag) => ({ questionId: question.id, tag })),
          skipDuplicates: true,
        });
      }
      return question;
    });
    return NextResponse.json(
      { ok: true, id: created.id, version: created.version },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? 'تعذّر إنشاء السؤال.'
        : error instanceof Error
          ? error.message
          : 'تعذّر إنشاء السؤال.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
