import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { canManageQuestions } from '@/lib/auth/authorization';
import { getCurrentSession, isSessionUserCurrent } from '@/lib/auth/session';
import { assertMoveIsSafe, CategoryCycleError } from '@/lib/questions/category-tree';
import type { CategoryRow } from '@/lib/questions/category-tree';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .regex(slugRegex)
      .nullable()
      .optional(),
    description: z.string().trim().max(500).nullable().optional(),
    icon: z.string().trim().max(40).nullable().optional(),
    parentId: z.string().trim().max(191).nullable().optional(),
    position: z.coerce.number().int().min(0).max(10000).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

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
    return { error: NextResponse.json({ ok: false, message: 'لا تملك صلاحية إدارة التصنيفات.' }, { status: 403 }) };
  }
  return { user: storedUser, requestIp: getClientIp(request) };
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

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authorize(_request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const prisma = getPrismaClient();
  const row = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { questions: true, children: true } },
    },
  });
  if (!row) {
    return NextResponse.json({ ok: false, message: 'التصنيف غير موجود.' }, { status: 404 });
  }
  return NextResponse.json(
    {
      ok: true,
      category: {
        ...rowFromPrisma(row),
        questionCount: row._count.questions,
        childCount: row._count.children,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const prisma = getPrismaClient();
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ ok: false, message: 'التصنيف غير موجود.' }, { status: 404 });
  }
  const parsed = updateCategorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? 'بيانات التصنيف غير صحيحة.' },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Re-parent: enforce no-cycle.
  if (Object.prototype.hasOwnProperty.call(data, 'parentId')) {
    const allRows = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        position: true,
        isActive: true,
        parentId: true,
      },
    });
    try {
      assertMoveIsSafe(allRows.map(rowFromPrisma), id, data.parentId ?? null);
    } catch (error) {
      if (error instanceof CategoryCycleError) {
        return NextResponse.json(
          { ok: false, message: 'لا يمكن نقل التصنيف تحت أحد أبنائه.' },
          { status: 400 },
        );
      }
      throw error;
    }
    if (data.parentId) {
      const parent = allRows.find((r) => r.id === data.parentId);
      if (!parent) {
        return NextResponse.json({ ok: false, message: 'التصنيف الأب غير موجود.' }, { status: 400 });
      }
    }
  }

  try {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.icon !== undefined ? { icon: data.icon } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return NextResponse.json(
      { ok: true, category: rowFromPrisma(updated) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث التصنيف.';
    if (message.includes('Unique') || message.includes('unique')) {
      return NextResponse.json(
        { ok: false, message: 'الاسم أو المعرف اللطيف مستخدم من قبل.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authorize(request);
  if ('error' in auth) return auth.error;
  const { id } = await context.params;
  const prisma = getPrismaClient();
  const childCount = await prisma.category.count({ where: { parentId: id } });
  if (childCount > 0) {
    return NextResponse.json(
      { ok: false, message: 'لا يمكن حذف تصنيف يحتوي على تصنيفات فرعية.' },
      { status: 400 },
    );
  }
  const questionCount = await prisma.question.count({ where: { categoryId: id } });
  if (questionCount > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: `لا يمكن حذف التصنيف لأنه يحتوي على ${questionCount} سؤالًا. انقل الأسئلة أولًا.`,
      },
      { status: 400 },
    );
  }
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذّر حذف التصنيف.';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
