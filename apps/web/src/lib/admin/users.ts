import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';
import { requirePermission } from '@/lib/auth/session';

const PAGE_SIZE = 20;

/** Revalidates the actor before selecting any managed account fields. */
export async function listManagedUsers(query: string, page: number) {
  await requirePermission('platform.users.manage', '/admin/users');
  const where = {
    status: { not: 'DELETED' as const },
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const prisma = getPrismaClient();
  const now = new Date();
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        tokenVersion: true,
        lastLoginAt: true,
        createdAt: true,
        subscriptions: {
          where: { status: 'ACTIVE', expiresAt: { gt: now } },
          orderBy: { expiresAt: 'desc' },
          select: { id: true, planCode: true, source: true, expiresAt: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return { users, total };
}
