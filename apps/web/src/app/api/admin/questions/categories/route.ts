import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { checkRateLimit } from '@/lib/auth/rate-limit';
import { buildCategoryTree, flattenCategoryTree, type CategoryRow } from '@/lib/questions/category-tree';

const CREATE_LIMIT = 20;
const ONE_MINUTE_MS = 60_000;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'اسم التصنيف قصير جدًا.').max(120, 'اسم التصنيف طويل جدًا.'),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(slugRegex, 'المعرف اللطيف يجب أن يكون بحروف لاتينية صغيرة وأرقام وشرطات فقط.')
    .optional()
    .nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  parentId: z.string().trim().max(191).optional().nullable(),
  position: z.coerce.number().int().min(0).max(10000).optional().default(0),
  isActive: z.boolean().optional().default(true),
});

function getClientIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function rowFromPrisma(row: {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  position: number;
  isActive: boolean;
  parentId: string | null;
}): CategoryRow {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    position: row.position,
    isActive: row.isActive,
    parentId: row.parentId,
  };
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
    return { error: NextResponse.json({ ok: false, message: 'لا تملك صلاحية إدارة التصنيفات.' }, { status: 403 }) };
  }
  return { user: storedUser, requestIp: getClientIp(request) };
}

export async function GET() {
  const auth = await authorize(new Request('http://internal'));
  if ('error' in auth) return auth.error;
  const prisma = getPrismaClient();
  const rows = await prisma.category.findMany({
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      position: true,
      isActive: true,
      parentId: true,
      _count: { select: { questions: true } },
    },
  });
  const tree = buildCategoryTree(rows.map(rowFromPrisma));
  const flat = flattenCategoryTree(tree);
  const counts = new Map(rows.map((row) => [row.id, row._count.questions] as const));
  return NextResponse.json(
    {
      ok: true,
      tree: tree.map((node) => ({
        ...node.row,
        questionCount: counts.get(node.row.id) ?? 0,
        leafCount: node.leafCount,
        descendantCount: node.descendantCount,
        children: node.children.map((child) => ({
          ...child.row,
          questionCount: counts.get(child.row.id) ?? 0,
          leafCount: child.leafCount,
          descendantCount: child.descendantCount,
        })),
      })),
      flat: flat.map((node) => ({
        ...node.row,
        questionCount: counts.get(node.row.id) ?? 0,
        depth: node.depth,
        descendantCount: node.descendantCount,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const allowed = await checkRateLimit(
    `question-category:user:${auth.user.id}`,
    CREATE_LIMIT,
    ONE_MINUTE_MS,
  );
  if (!allowed) {
    return NextResponse.json({ ok: false, message: 'تجاوزت الحد المؤقت. حاول لاحقًا.' }, { status: 429 });
  }
  const parsed = createCategorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'بيانات التصنيف غير صحيحة.' },
      { status: 400 },
    );
  }
  if (parsed.data.parentId) {
    const parent = await getPrismaClient().category.findUnique({ where: { id: parsed.data.parentId } });
    if (!parent) {
      return NextResponse.json({ ok: false, message: 'التصنيف الأب غير موجود.' }, { status: 400 });
    }
  }
  const prisma = getPrismaClient();
  try {
    const created = await prisma.category.create({
      data: {
        name: parsed.data.name,
        slug: parsed.data.slug ?? null,
        description: parsed.data.description ?? null,
        icon: parsed.data.icon ?? null,
        parentId: parsed.data.parentId ?? null,
        position: parsed.data.position ?? 0,
        isActive: parsed.data.isActive ?? true,
      },
    });
    return NextResponse.json(
      { ok: true, category: rowFromPrisma(created) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر إنشاء التصنيف.';
    if (message.includes('Unique') || message.includes('unique')) {
      return NextResponse.json(
        { ok: false, message: 'الاسم أو المعرف اللطيف مستخدم من قبل.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
