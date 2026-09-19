import { getSharedRedis } from '@/lib/auth/rate-limit';
import { getPrismaClient, hasDatabaseUrl } from '@/lib/auth/prisma';
import { readPresenceCounts } from './presence-store';

export type AudienceSnapshot = {
  presentNow: number;
  /** زائر فريد بالمعرّف المجهّل خلال اليوم بالتوقيت العالمي. */
  uniqueToday: number;
  /** زيارة جديدة بعد انقطاع المعرّف نفسه ثلاثين دقيقة على الأقل. */
  viewsToday: number;
  livePlayers: number;
  recentLogins: number;
  updatedAt: string;
  source: 'redis' | 'memory';
};

export async function getAudienceSnapshot(now = Date.now()): Promise<AudienceSnapshot> {
  const presence = await readPresenceCounts(now);
  let livePlayers = 0;
  let recentLogins = 0;

  if (hasDatabaseUrl()) {
    const prisma = getPrismaClient();
    const since = new Date(now - 24 * 60 * 60 * 1000);
    [livePlayers, recentLogins] = await Promise.all([
      prisma.liveParticipant.count({
        where: {
          status: 'CONNECTED',
          session: { status: { in: ['WAITING', 'ACTIVE'] } },
        },
      }),
      prisma.user.count({
        where: {
          status: { not: 'DELETED' },
          lastLoginAt: { gte: since },
        },
      }),
    ]);
  }

  return {
    ...presence,
    livePlayers,
    recentLogins,
    updatedAt: new Date(now).toISOString(),
    source: getSharedRedis() ? 'redis' : 'memory',
  };
}
