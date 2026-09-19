import type { Metadata } from 'next';
import DisplayPage from '../display/page';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'شاشة البث | تحدّي',
  description: 'شاشة البث السينمائية للمسابقات المباشرة في تحدّي.',
  alternates: { canonical: '/broadcast' },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string; preview?: string }>;
}) {
  const { sessionId, preview } = await searchParams;
  const latestSession =
    !sessionId && hasDatabaseUrl()
      ? await getPrismaClient().liveSession.findFirst({
          where: { status: { in: ['WAITING', 'ACTIVE'] } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        })
      : null;

  return DisplayPage({
    searchParams: Promise.resolve({ sessionId: sessionId ?? latestSession?.id, preview }),
  });
}
