import 'server-only';
import { getPrismaClient } from '@/lib/auth/prisma';
import { createSentryOptions } from '@/lib/observability/sentry-options';
import { getAudienceSnapshot, type AudienceSnapshot } from '@/lib/presence/audience';
import { getRecentSentryIssues, type SentryIssuesSnapshot } from './monitor-errors';

type ServiceCheck = {
  status: 'responsive' | 'unavailable' | 'unconfigured';
  latencyMs: number | null;
};

export type MonitoringSnapshot = {
  updatedAt: string;
  audience: AudienceSnapshot | null;
  rooms: {
    active: number | null;
    created24h: number | null;
    livePlayers: number | null;
    recent:
      | {
          id: string;
          code: string;
          title: string;
          status: 'WAITING' | 'ACTIVE';
          participants: number;
          createdAt: string;
        }[]
      | null;
  };
  newUsers24h: number | null;
  errors: SentryIssuesSnapshot;
  services: {
    databaseQueryMs: number | null;
    databaseStatus: 'available' | 'unavailable';
    web: ServiceCheck;
    realtime: ServiceCheck;
    errorCapture: { server: boolean; browser: boolean };
  };
};

async function checkWeb(): Promise<ServiceCheck> {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configuredUrl) return { status: 'unconfigured', latencyMs: null };
  try {
    const url = new URL('/', configuredUrl);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return { status: 'unconfigured', latencyMs: null };
    }
    const started = performance.now();
    const response = await fetch(url.toString(), {
      method: 'HEAD',
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    });
    return {
      status: response.ok ? 'responsive' : 'unavailable',
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    return { status: 'unavailable', latencyMs: null };
  }
}

async function checkRealtime(): Promise<ServiceCheck> {
  const configuredUrl = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  if (!configuredUrl) return { status: 'unconfigured', latencyMs: null };

  try {
    const url = new URL('/health', configuredUrl);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return { status: 'unconfigured', latencyMs: null };
    }
    const started = performance.now();
    const response = await fetch(url.toString(), {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(3_000),
    });
    const payload: unknown = response.ok ? await response.json() : null;
    const healthy =
      typeof payload === 'object' &&
      payload !== null &&
      'service' in payload &&
      payload.service === 'tahaddi-realtime' &&
      'status' in payload &&
      payload.status === 'ok';
    return {
      status: healthy ? 'responsive' : 'unavailable',
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    return { status: 'unavailable', latencyMs: null };
  }
}

export async function getMonitoringSnapshot(now = new Date()): Promise<MonitoringSnapshot> {
  const prisma = getPrismaClient();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
  const connectedPlayers = { status: 'CONNECTED' as const };
  const dbStarted = performance.now();
  const dbQueries = Promise.all([
    prisma.liveSession.count({ where: { status: { in: ['WAITING', 'ACTIVE'] } } }),
    prisma.liveSession.count({ where: { createdAt: { gte: since } } }),
    prisma.liveSession.findMany({
      where: { status: { in: ['WAITING', 'ACTIVE'] } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        roomCode: true,
        status: true,
        createdAt: true,
        quiz: { select: { title: true } },
        _count: { select: { participants: { where: connectedPlayers } } },
      },
    }),
    prisma.user.count({ where: { status: { not: 'DELETED' }, createdAt: { gte: since } } }),
  ])
    .then((result) => ({ result, latencyMs: Math.round(performance.now() - dbStarted) }))
    .catch((error: unknown) => {
      const reportedCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN';
      const code = /^[A-Z0-9_-]{1,32}$/.test(reportedCode) ? reportedCode : 'UNKNOWN';
      console.error('[admin-monitor] database metrics unavailable', code);
      return null;
    });
  const [database, audience, web, realtime, errors] = await Promise.all([
    dbQueries,
    getAudienceSnapshot(now.getTime()).catch(() => null),
    checkWeb(),
    checkRealtime(),
    getRecentSentryIssues(),
  ]);
  const [active, created24h, recent, newUsers24h] = database?.result ?? [null, null, null, null];

  return {
    updatedAt: now.toISOString(),
    audience,
    rooms: {
      active,
      created24h,
      livePlayers: audience?.livePlayers ?? null,
      recent:
        recent?.map((room) => ({
          id: room.id,
          code: room.roomCode,
          title: room.quiz.title,
          status: room.status as 'WAITING' | 'ACTIVE',
          participants: room._count.participants,
          createdAt: room.createdAt.toISOString(),
        })) ?? null,
    },
    newUsers24h,
    errors,
    services: {
      databaseQueryMs: database?.latencyMs ?? null,
      databaseStatus: database ? 'available' : 'unavailable',
      web,
      realtime,
      errorCapture: {
        server: createSentryOptions(process.env).enabled,
        browser: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()),
      },
    },
  };
}
