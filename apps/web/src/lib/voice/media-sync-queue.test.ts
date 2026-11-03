type Job = { roomId: string; generation: string; attempts: number; leaseToken: string | null; leaseExpiresAt: Date | null; nextAttemptAt: Date };
type JobWhere = { generation?: string; leaseToken?: string };
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ job: null as unknown as Job, reconcile: vi.fn(), stateCleared: false }));
vi.mock('./livekit', () => ({ reconcileVoiceMedia: mocks.reconcile }));
vi.mock('@/lib/auth/prisma', () => {
  const jobs = {
    findFirst: vi.fn(async () => structuredClone(mocks.job)),
    findUnique: vi.fn(async () => structuredClone(mocks.job)),
    updateMany: vi.fn(async ({ where, data }: { where: JobWhere; data: Partial<Job> }) => {
      const job = mocks.job;
      if (
        !job ||
        (where.generation && job.generation !== where.generation) ||
        (where.leaseToken && job.leaseToken !== where.leaseToken)
      )
        return { count: 0 };
      Object.assign(job, data);
      return { count: 1 };
    }),
    deleteMany: vi.fn(async ({ where }: { where: JobWhere }) => {
      const job = mocks.job;
      if (!job || job.generation !== where.generation || job.leaseToken !== where.leaseToken)
        return { count: 0 };
      mocks.job = null as unknown as Job;
      return { count: 1 };
    }),
  };
  const db = {
    voiceMediaReconcileJob: jobs,
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => {
      mocks.stateCleared = true;
      return 1;
    }),
    $transaction: vi.fn(async (fn: (client: typeof db) => Promise<unknown>) => fn(db)),
  };
  return { getPrismaClient: () => db };
});

import { processVoiceMediaJob } from './media-sync-queue';

describe('durable voice media reconciliation', () => {
  beforeEach(() => {
    mocks.job = {
      roomId: 'room',
      generation: 'first',
      attempts: 0,
      leaseToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: new Date(0),
    };
    mocks.stateCleared = false;
    mocks.reconcile.mockReset();
  });
  it('keeps the job pending after provider failure and completes it on a later retry', async () => {
    mocks.reconcile
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce(undefined);
    expect(await processVoiceMediaJob('room')).toBe('failed');
    expect(mocks.job).not.toBeNull();
    expect(mocks.stateCleared).toBe(false);
    mocks.job.nextAttemptAt = new Date(0);
    expect(await processVoiceMediaJob('room')).toBe('completed');
    expect(mocks.job).toBeNull();
    expect(mocks.stateCleared).toBe(true);
  });
  it('does not clear newer membership work created while the provider call runs', async () => {
    mocks.reconcile.mockImplementationOnce(async () => {
      mocks.job.generation = 'newer';
    });
    expect(await processVoiceMediaJob('room')).toBe('superseded');
    expect(mocks.job.generation).toBe('newer');
    expect(mocks.stateCleared).toBe(false);
  });
});
